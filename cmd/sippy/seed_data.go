package main

import (
	"context"
	"database/sql"
	stderrors "errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"cloud.google.com/go/civil"
	"github.com/lib/pq"
	"github.com/pkg/errors"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
	"k8s.io/apimachinery/pkg/util/sets"

	componentreadiness "github.com/openshift/sippy/pkg/api/componentreadiness"
	pgprovider "github.com/openshift/sippy/pkg/api/componentreadiness/dataprovider/postgres"
	"github.com/openshift/sippy/pkg/api/componentreadiness/utils"
	apitype "github.com/openshift/sippy/pkg/apis/api"
	"github.com/openshift/sippy/pkg/apis/api/componentreport/reqopts"
	v1 "github.com/openshift/sippy/pkg/apis/sippyprocessing/v1"
	"github.com/openshift/sippy/pkg/db"
	"github.com/openshift/sippy/pkg/db/models"
	"github.com/openshift/sippy/pkg/db/models/jobrunscan"
	"github.com/openshift/sippy/pkg/flags"
	"github.com/openshift/sippy/pkg/sippyserver"
)

type SeedDataFlags struct {
	DBFlags      *flags.PostgresFlags
	InitDatabase bool
}

func NewSeedDataFlags() *SeedDataFlags {
	return &SeedDataFlags{
		DBFlags: flags.NewPostgresDatabaseFlags(),
	}
}

func (f *SeedDataFlags) BindFlags(fs *pflag.FlagSet) {
	f.DBFlags.BindFlags(fs)
	fs.BoolVar(&f.InitDatabase, "init-database", false, "Initialize the DB schema before seeding data")
}

func NewSeedDataCommand() *cobra.Command {
	f := NewSeedDataFlags()

	cmd := &cobra.Command{
		Use:   "seed-data",
		Short: "Populate test data in the database",
		Long: `Populate test data in the database for development purposes.

Creates deterministic Component Readiness data covering all CR statuses
(NotSignificant, SignificantRegression, ExtremeRegression, MissingSample,
MissingBasis, BasisOnly, SignificantImprovement, BelowMinFailure) and
fallback scenarios. Use with 'sippy serve --data-provider postgres'.

Drop and recreate the database to re-seed (e.g. docker compose down -v).
`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if strings.Contains(f.DBFlags.DSN, "amazonaws.com") {
				return fmt.Errorf("refusing to seed synthetic data into a production database")
			}

			dbc, err := f.DBFlags.GetDBClient()
			if err != nil {
				return errors.WithMessage(err, "could not connect to database")
			}

			if f.InitDatabase {
				log.Info("Initializing database schema...")
				t := f.DBFlags.GetPinnedTime()
				if err := dbc.UpdateSchema(t); err != nil {
					return errors.WithMessage(err, "could not migrate database")
				}
				log.Info("Database schema initialized successfully")

				// Create partitions for synthetic releases
				log.Info("Creating partitions for synthetic test data...")
				startDate := time.Now().UTC().AddDate(0, 0, -190) // Cover all seed data date ranges
				endDate := time.Now().UTC().AddDate(0, 0, 2)      // Small buffer into future
				count, err := dbc.EnsurePartitions(syntheticReleases, startDate, endDate, false)
				if err != nil {
					return errors.WithMessage(err, "could not create partitions")
				}
				log.Infof("Created %d partitions for synthetic releases", count)
			}

			log.Info("Starting to seed test data...")
			return seedSyntheticData(dbc)
		},
	}

	f.BindFlags(cmd.Flags())

	return cmd
}

// --- Synthetic data seeding ---

// syntheticJobDef defines a job with its full 9-key variant map.
type syntheticJobDef struct {
	nameTemplate string
	variants     map[string]string
}

// syntheticTestSpec defines a test with deterministic pass/fail counts per release per job.
type syntheticTestSpec struct {
	testID       string
	testName     string
	component    string
	capabilities []string
	// Each entry maps a job name template -> per-release counts.
	// The job template determines which variants the test runs with.
	jobCounts map[string]map[string]testCount // jobTemplate -> release -> counts
}

type testCount struct {
	total   int
	success int
	flake   int
}

var syntheticReleases = []string{"4.22", "4.21", "4.20", "4.19", models.ReleasePresubmits}

var syntheticJobs = []syntheticJobDef{
	{
		nameTemplate: "periodic-ci-openshift-release-master-ci-%s-upgrade-from-stable-4.21-e2e-aws-ovn-upgrade",
		variants: map[string]string{
			"Platform": "aws", "Architecture": "amd64", "Network": "ovn",
			"Topology": "ha", "Installer": "ipi", "FeatureSet": "default",
			"Suite": "unknown", "Upgrade": "minor", "LayeredProduct": "none",
		},
	},
	{
		nameTemplate: "periodic-ci-openshift-release-master-ci-%s-e2e-aws-ovn-amd64",
		variants: map[string]string{
			"Platform": "aws", "Architecture": "amd64", "Network": "ovn",
			"Topology": "ha", "Installer": "ipi", "FeatureSet": "default",
			"Suite": "parallel", "Upgrade": "none", "LayeredProduct": "none",
		},
	},
	{
		nameTemplate: "periodic-ci-openshift-release-master-ci-%s-e2e-aws-ovn-arm64",
		variants: map[string]string{
			"Platform": "aws", "Architecture": "arm64", "Network": "ovn",
			"Topology": "ha", "Installer": "ipi", "FeatureSet": "default",
			"Suite": "parallel", "Upgrade": "none", "LayeredProduct": "none",
		},
	},
	{
		nameTemplate: "periodic-ci-openshift-release-master-ci-%s-e2e-aws-ovn-techpreview-serial",
		variants: map[string]string{
			"Platform": "aws", "Architecture": "amd64", "Network": "ovn",
			"Topology": "ha", "Installer": "ipi", "FeatureSet": "techpreview",
			"Suite": "serial", "Upgrade": "none", "LayeredProduct": "none",
		},
	},
	{
		nameTemplate: "periodic-ci-openshift-release-master-ci-%s-e2e-gcp-ovn-amd64",
		variants: map[string]string{
			"Platform": "gcp", "Architecture": "amd64", "Network": "ovn",
			"Topology": "ha", "Installer": "ipi", "FeatureSet": "default",
			"Suite": "parallel", "Upgrade": "none", "LayeredProduct": "none",
		},
	},
	{
		nameTemplate: "periodic-ci-openshift-release-master-ci-%s-e2e-gcp-ovn-upgrade-micro",
		variants: map[string]string{
			"Platform": "gcp", "Architecture": "amd64", "Network": "ovn",
			"Topology": "ha", "Installer": "ipi", "FeatureSet": "default",
			"Suite": "unknown", "Upgrade": "micro", "LayeredProduct": "none",
		},
	},
	{
		nameTemplate: "periodic-ci-openshift-release-master-ci-%s-e2e-aws-ovn-amd64-capability-networksegmentation",
		variants: map[string]string{
			"Platform": "aws", "Architecture": "amd64", "Network": "ovn",
			"Topology": "ha", "Installer": "ipi", "FeatureSet": "default",
			"Suite": "parallel", "Upgrade": "none", "LayeredProduct": "none",
			"Capability": "NetworkSegmentation",
		},
	},
	{
		nameTemplate: "periodic-ci-openshift-release-master-ci-%s-e2e-aws-ovn-amd64-capability-awsdualstackinstall",
		variants: map[string]string{
			"Platform": "aws", "Architecture": "amd64", "Network": "ovn",
			"Topology": "ha", "Installer": "ipi", "FeatureSet": "default",
			"Suite": "parallel", "Upgrade": "none", "LayeredProduct": "none",
			"Capability": "AWSDualStackInstall",
		},
	},
	// Azure job: Platform:azure is NOT in the default seed view, so results
	// from this job should be filtered out when the default view is active.
	{
		nameTemplate: "periodic-ci-openshift-release-master-ci-%s-e2e-azure-ovn-amd64",
		variants: map[string]string{
			"Platform": "azure", "Architecture": "amd64", "Network": "ovn",
			"Topology": "ha", "Installer": "ipi", "FeatureSet": "default",
			"Suite": "parallel", "Upgrade": "none", "LayeredProduct": "none",
		},
	},
}

// Job template constants for referencing specific jobs in test specs.
const awsAmd64Parallel = "periodic-ci-openshift-release-master-ci-%s-e2e-aws-ovn-amd64"
const awsArm64Parallel = "periodic-ci-openshift-release-master-ci-%s-e2e-aws-ovn-arm64"
const gcpAmd64Parallel = "periodic-ci-openshift-release-master-ci-%s-e2e-gcp-ovn-amd64"
const awsAmd64CapabilityAWSDualStackInstall = "periodic-ci-openshift-release-master-ci-%s-e2e-aws-ovn-amd64-capability-awsdualstackinstall"
const awsAmd64CapabilityNetworkSegmentation = "periodic-ci-openshift-release-master-ci-%s-e2e-aws-ovn-amd64-capability-networksegmentation"
const azureAmd64Parallel = "periodic-ci-openshift-release-master-ci-%s-e2e-azure-ovn-amd64"

// allJobTemplates returns name templates from syntheticJobs for use in test specs
// that should run on every job (e.g. install tests).
func allJobTemplates() []string {
	templates := make([]string, len(syntheticJobs))
	for i, j := range syntheticJobs {
		templates[i] = j.nameTemplate
	}
	return templates
}

// allJobCounts builds a jobCounts map that assigns the given per-release counts
// to every synthetic job. Used for tests like install indicators that run everywhere.
func allJobCounts(releaseCounts map[string]testCount) map[string]map[string]testCount {
	result := make(map[string]map[string]testCount, len(syntheticJobs))
	for _, tpl := range allJobTemplates() {
		result[tpl] = releaseCounts
	}
	return result
}

var syntheticTests = []syntheticTestSpec{
	// --- NotSignificant: appears in 3 jobs across 2 platforms ---
	{
		testID: "test-not-significant", testName: "[sig-arch] Check build pods use all cpu cores",
		component: "comp-NotSignificant", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.21": {100, 95, 0}, "4.22": {100, 93, 0}},
			awsArm64Parallel: {"4.21": {80, 76, 0}, "4.22": {80, 75, 0}},
			gcpAmd64Parallel: {"4.21": {100, 97, 0}, "4.22": {100, 95, 0}},
		},
	},

	// --- SignificantRegression: regressed on aws/amd64, fine elsewhere ---
	{
		testID: "test-significant-regression", testName: "[sig-network] Services should serve endpoints on same port and different protocol",
		component: "comp-SignificantRegression", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.21": {200, 190, 0}, "4.22": {200, 170, 0}},
			awsArm64Parallel: {"4.21": {180, 171, 0}, "4.22": {180, 168, 0}},
			gcpAmd64Parallel: {"4.21": {200, 190, 0}, "4.22": {200, 188, 0}},
		},
	},

	// --- ExtremeRegression: extreme on aws/amd64, significant on others ---
	// Also runs on azure (not in default view) to test variant filtering.
	{
		testID: "test-extreme-regression", testName: "[sig-etcd] etcd leader changes are not excessive",
		component: "comp-ExtremeRegression", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel:   {"4.21": {200, 190, 0}, "4.22": {200, 140, 0}},
			awsArm64Parallel:   {"4.21": {200, 190, 0}, "4.22": {200, 170, 0}},
			gcpAmd64Parallel:   {"4.21": {200, 190, 0}, "4.22": {200, 170, 0}},
			azureAmd64Parallel: {"4.21": {200, 190, 0}, "4.22": {200, 140, 0}},
		},
	},

	// --- MissingSample: test in base, 0 sample runs ---
	{
		testID: "test-missing-sample", testName: "[sig-storage] CSI volumes should be mountable",
		component: "comp-MissingSample", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.21": {100, 95, 0}, "4.22": {0, 0, 0}},
		},
	},

	// --- MissingBasis: test only in sample ---
	{
		testID: "test-missing-basis", testName: "[sig-node] New pod lifecycle test",
		component: "comp-MissingBasis", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.22": {100, 95, 0}},
		},
	},

	// --- NewTestPassRateRegression: new test only in sample, below PassRateRequiredNewTests threshold ---
	{
		testID: "test-new-test-pass-rate-fail", testName: "[sig-node] New flaky pod readiness test",
		component: "comp-NewTestPassRate", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.22": {100, 70, 0}},
		},
	},

	// --- BasisOnly: test in base, absent from sample ---
	{
		testID: "test-basis-only", testName: "[sig-apps] Removed deployment test",
		component: "comp-BasisOnly", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.21": {100, 95, 0}},
		},
	},

	// --- SignificantImprovement: 80% -> 95% ---
	{
		testID: "test-significant-improvement", testName: "[sig-cli] oc adm should handle upgrades gracefully",
		component: "comp-SignificantImprovement", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.21": {200, 160, 0}, "4.22": {200, 190, 0}},
		},
	},

	// --- BelowMinFailure: only 2 failures, below MinimumFailure=3 ---
	{
		testID: "test-below-min-failure", testName: "[sig-auth] RBAC should allow access with valid token",
		component: "comp-BelowMinFailure", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.21": {100, 100, 0}, "4.22": {100, 98, 0}},
		},
	},

	// --- Fallback: 4.21 worse, 4.20 better -> swaps to 4.20 ---
	{
		testID: "test-fallback-improves", testName: "[sig-instrumentation] Metrics should report accurate cpu usage",
		component: "comp-FallbackImproves", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {
				"4.21": {200, 180, 0},
				"4.20": {200, 194, 0},
				"4.22": {200, 160, 0},
			},
		},
	},

	// --- Double fallback: 4.21->4.20->4.19 ---
	{
		testID: "test-fallback-double", testName: "[sig-scheduling] Scheduler should spread pods evenly",
		component: "comp-FallbackDouble", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {
				"4.21": {200, 180, 0},
				"4.20": {200, 186, 0},
				"4.19": {200, 194, 0},
				"4.22": {200, 160, 0},
			},
		},
	},

	// --- Fallback insufficient runs: 4.20 has <60% of 4.21 count ---
	{
		testID: "test-fallback-insufficient-runs", testName: "[sig-network] DNS should resolve cluster services",
		component: "comp-FallbackInsufficient", capabilities: []string{"cap1"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {
				"4.21": {1000, 940, 0},
				"4.20": {100, 99, 0},
				"4.22": {1000, 850, 0},
			},
		},
	},

	// --- Feature gate annotated tests ---
	{
		testID: "test-fg-network-segmentation", testName: "[sig-network] [FeatureGate:NetworkSegmentation] pods should communicate across segments",
		component: "Networking / ovn-kubernetes", capabilities: []string{"networking"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.21": {100, 95, 0}, "4.22": {100, 93, 0}},
			gcpAmd64Parallel: {"4.21": {100, 97, 0}, "4.22": {100, 95, 0}},
		},
	},
	{
		testID: "test-fg-network-segmentation-2", testName: "[sig-network] [FeatureGate:NetworkSegmentation] network policy should enforce segmentation",
		component: "Networking / ovn-kubernetes", capabilities: []string{"networking"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.21": {100, 94, 0}, "4.22": {100, 92, 0}},
		},
	},
	{
		testID: "test-fg-aws-dual-stack-install", testName: "[sig-installer] [FeatureGate:AWSDualStackInstall] specific test for the dual stack install feature",
		component: "Installer / openshift-installer", capabilities: []string{"AWSDualStackInstall"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64Parallel: {"4.22": {50, 48, 0}},
		},
	},
	{
		testID: "test-cap-aws-dual-stack-install", testName: "install should succeed: infrastructure",
		component: "Installer / openshift-installer", capabilities: []string{"install"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64CapabilityAWSDualStackInstall: {"4.22": {50, 47, 0}},
		},
	},

	// --- Tests on azure (Platform:azure not in the default view, used to test variant filtering) ---
	{
		testID: "test-azure-networking", testName: "[sig-network] Azure load balancer should distribute traffic",
		component: "comp-AzureNetworking", capabilities: []string{"networking"},
		jobCounts: map[string]map[string]testCount{
			azureAmd64Parallel: {"4.21": {100, 95, 0}, "4.22": {100, 80, 0}},
		},
	},

	// --- Capability regression tests: tests on capability jobs with low pass rates ---
	{
		testID: "test-cap-regression-netseg", testName: "[sig-network] network connectivity should be reliable across nodes",
		component: "Networking / ovn-kubernetes", capabilities: []string{"networking"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64CapabilityNetworkSegmentation: {"4.22": {100, 85, 0}},
		},
	},
	{
		testID: "test-cap-regression-unpromoted-gate", testName: "[sig-network] [OCPFeatureGate:UnpromotedTestGate] should handle traffic correctly",
		component: "Networking / ovn-kubernetes", capabilities: []string{"networking"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64CapabilityNetworkSegmentation: {"4.22": {100, 80, 0}},
		},
	},
	{
		testID: "test-cap-regression-awsdualstack", testName: "[sig-network] dual stack services should route correctly",
		component: "Networking / ovn-kubernetes", capabilities: []string{"networking"},
		jobCounts: map[string]map[string]testCount{
			awsAmd64CapabilityAWSDualStackInstall: {"4.22": {100, 88, 0}},
		},
	},

	// --- Install / health indicator tests: run on every job, every release ---
	{
		testID: "test-install-overall", testName: "install should succeed: overall",
		component: "comp-Install", capabilities: []string{"install"},
		jobCounts: allJobCounts(map[string]testCount{
			"4.22": {100, 95, 0}, "4.21": {100, 96, 0}, "4.20": {100, 97, 0}, "4.19": {100, 97, 0},
		}),
	},
	{
		testID: "test-install-config", testName: "install should succeed: configuration",
		component: "comp-Install", capabilities: []string{"install"},
		jobCounts: allJobCounts(map[string]testCount{
			"4.22": {100, 97, 0}, "4.21": {100, 98, 0}, "4.20": {100, 98, 0}, "4.19": {100, 98, 0},
		}),
	},
	{
		testID: "test-install-bootstrap", testName: "install should succeed: cluster bootstrap",
		component: "comp-Install", capabilities: []string{"install"},
		jobCounts: allJobCounts(map[string]testCount{
			"4.22": {100, 96, 0}, "4.21": {100, 97, 0}, "4.20": {100, 97, 0}, "4.19": {100, 97, 0},
		}),
	},
	{
		testID: "test-install-other", testName: "install should succeed: other",
		component: "comp-Install", capabilities: []string{"install"},
		jobCounts: allJobCounts(map[string]testCount{
			"4.22": {100, 98, 0}, "4.21": {100, 99, 0}, "4.20": {100, 99, 0}, "4.19": {100, 99, 0},
		}),
	},
	{
		testID: "test-install-infra", testName: "install should succeed: infrastructure",
		component: "comp-Install", capabilities: []string{"install"},
		jobCounts: allJobCounts(map[string]testCount{
			"4.22": {100, 96, 0}, "4.21": {100, 97, 0}, "4.20": {100, 97, 0}, "4.19": {100, 97, 0},
		}),
	},
	{
		testID: "test-upgrade", testName: "[sig-sippy] upgrade should work",
		component: "comp-Install", capabilities: []string{"upgrade"},
		jobCounts: allJobCounts(map[string]testCount{
			"4.22": {100, 94, 0}, "4.21": {100, 95, 0}, "4.20": {100, 96, 0}, "4.19": {100, 96, 0},
		}),
	},
	{
		testID: "test-openshift-tests", testName: "[sig-sippy] openshift-tests should work",
		component: "comp-Install", capabilities: []string{"tests"},
		jobCounts: allJobCounts(map[string]testCount{
			"4.22": {100, 90, 0}, "4.21": {100, 92, 0}, "4.20": {100, 93, 0}, "4.19": {100, 93, 0},
		}),
	},
}

// releaseTimeWindow returns the start/end times for a release's test data.
func releaseTimeWindow(release string) (start, end time.Time) {
	now := time.Now().UTC().Truncate(time.Hour)
	switch release {
	case "4.22":
		return now.Add(-3 * 24 * time.Hour), now
	case "4.21":
		return now.Add(-60 * 24 * time.Hour), now.Add(-30 * 24 * time.Hour)
	case "4.20":
		return now.Add(-120 * 24 * time.Hour), now.Add(-90 * 24 * time.Hour)
	case "4.19":
		return now.Add(-180 * 24 * time.Hour), now.Add(-150 * 24 * time.Hour)
	default:
		return now.Add(-14 * 24 * time.Hour), now
	}
}

func seedSyntheticData(dbc *db.DB) error {
	// Check if data already exists
	var count int64
	if err := dbc.DB.Model(&models.ProwJob{}).Count(&count).Error; err != nil {
		return fmt.Errorf("failed to check for existing data: %w", err)
	}
	if count > 0 {
		log.Infof("Database already contains %d ProwJobs, skipping seed. Drop and recreate the database to re-seed (e.g. docker compose down -v).", count)
		// Feature gates use FirstOrCreate and are safe to re-run on an existing DB.
		if err := seedFeatureGates(dbc); err != nil {
			return errors.WithMessage(err, "failed to seed feature gates")
		}
		return nil
	}

	if err := seedReleaseDefinitions(dbc); err != nil {
		return errors.WithMessage(err, "failed to seed release definitions")
	}
	log.Info("Seeded release definitions")

	if err := createTestSuite(dbc, "synthetic"); err != nil {
		return errors.WithMessage(err, "failed to create test suite")
	}
	log.Info("Created test suite 'synthetic'")

	if err := seedProwJobs(dbc); err != nil {
		return err
	}

	if err := seedTestsAndOwnerships(dbc); err != nil {
		return err
	}

	totalRuns, totalResults, err := seedJobRunsAndResults(dbc)
	if err != nil {
		return err
	}

	if err := seedPresubmitData(dbc); err != nil {
		return errors.WithMessage(err, "failed to seed presubmit data")
	}
	log.Info("Seeded presubmit/PR test data")

	if err := seedReleasePayloadTags(dbc); err != nil {
		return errors.WithMessage(err, "failed to seed release payload tags")
	}
	log.Info("Seeded release payload tags")

	if err := seedPeriodicTestOutputs(dbc); err != nil {
		return errors.WithMessage(err, "failed to seed periodic test outputs")
	}
	log.Info("Seeded periodic test outputs")

	if err := createLabelsAndSymptoms(dbc); err != nil {
		return errors.WithMessage(err, "failed to create labels and symptoms")
	}

	if err := seedFeatureGates(dbc); err != nil {
		return errors.WithMessage(err, "failed to seed feature gates")
	}

	log.Info("Refreshing materialized views...")
	seedToday := civil.DateOf(time.Now().UTC())
	seedStart := seedToday.AddDays(-190)
	seedEnd := seedToday
	for _, table := range []string{"daily-totals", "cumulative-summaries"} {
		if err := sippyserver.BackfillData(dbc, table, seedStart, seedEnd); err != nil {
			return fmt.Errorf("failed to backfill %s: %w", table, err)
		}
	}

	if err := seedGARawTestData(dbc); err != nil {
		return errors.WithMessage(err, "failed to seed GA raw test data")
	}
	log.Info("Seeded GA raw test data")

	if err := sippyserver.RefreshData(dbc, nil, sippyserver.RefreshOptions{}); err != nil {
		return fmt.Errorf("failed to refresh data: %w", err)
	}

	log.Info("Syncing regressions...")
	if err := syncRegressions(dbc); err != nil {
		return errors.WithMessage(err, "failed to sync regressions")
	}

	if err := seedBugsAndTriages(dbc); err != nil {
		return errors.WithMessage(err, "failed to seed bugs and triages")
	}
	log.Info("Seeded bugs and triages")

	log.Infof("Seeded synthetic data: %d ProwJobRuns, %d test results across %d releases",
		totalRuns, totalResults, len(syntheticReleases))
	return nil
}

func seedReleaseDefinitions(dbc *db.DB) error {
	today := civil.DateOf(time.Now().UTC())
	allCaps := pq.StringArray{models.CapComponentReadiness, models.CapFeatureGates, models.CapMetrics, models.CapPayloadTags, models.CapSippyClassic}

	type relMeta struct {
		previous string
		gaDays   int // negative = days before now; 0 = no GA (in development)
	}
	meta := map[string]relMeta{
		"4.19": {previous: "4.18", gaDays: -289},
		"4.20": {previous: "4.19", gaDays: -163},
		"4.21": {previous: "4.20", gaDays: -58},
		"4.22": {previous: "4.21"},
	}

	for _, release := range syntheticReleases {
		var def models.ReleaseDefinition

		if release == models.ReleasePresubmits {
			def = models.ReleaseDefinition{
				Release:      release,
				Product:      "OCP",
				Status:       "Development",
				Capabilities: pq.StringArray{models.CapPullRequests, models.CapSippyClassic},
			}
		} else {
			m := meta[release]
			parts := strings.Split(release, ".")
			major, minor := 0, 0
			if len(parts) >= 2 {
				_, _ = fmt.Sscanf(parts[0], "%d", &major)
				_, _ = fmt.Sscanf(parts[1], "%d", &minor)
			}

			develStart := today.AddDays(m.gaDays - 180)
			def = models.ReleaseDefinition{
				Release:              release,
				Major:                major,
				Minor:                minor,
				PreviousRelease:      m.previous,
				DevelopmentStartDate: &develStart,
				Product:              "OCP",
				Status:               "Full Support",
				Capabilities:         allCaps,
			}
			if m.gaDays != 0 {
				ga := today.AddDays(m.gaDays)
				def.GADate = &ga
			}
		}

		if err := dbc.DB.Where("release = ?", release).FirstOrCreate(&def).Error; err != nil {
			return fmt.Errorf("failed to create release definition %s: %w", release, err)
		}
	}
	return nil
}

func seedProwJobs(dbc *db.DB) error {
	for _, release := range syntheticReleases {
		for _, job := range syntheticJobs {
			name := fmt.Sprintf(job.nameTemplate, release)
			variants := variantMapToArray(job.variants)
			prowJob := models.ProwJob{
				Kind:     models.ProwKind("periodic"),
				Name:     name,
				Release:  release,
				Variants: variants,
			}
			var existing models.ProwJob
			if err := dbc.DB.Where("name = ?", name).FirstOrCreate(&existing, prowJob).Error; err != nil {
				return fmt.Errorf("failed to create ProwJob %s: %w", name, err)
			}
		}
	}
	log.Infof("Created ProwJobs for %d releases x %d jobs", len(syntheticReleases), len(syntheticJobs))
	return nil
}

type testInfo struct {
	name         string
	uniqueID     string
	component    string
	capabilities []string
}

func seedTestsAndOwnerships(dbc *db.DB) error {
	var suite models.Suite
	if err := dbc.DB.Where("name = ?", "synthetic").First(&suite).Error; err != nil {
		return fmt.Errorf("failed to find suite: %w", err)
	}

	seenTests := map[string]testInfo{}
	for _, ts := range syntheticTests {
		if _, ok := seenTests[ts.testName]; !ok {
			seenTests[ts.testName] = testInfo{
				name:         ts.testName,
				uniqueID:     ts.testID,
				component:    ts.component,
				capabilities: ts.capabilities,
			}
		}
	}

	for _, info := range seenTests {
		testModel := models.Test{Name: info.name}
		var existingTest models.Test
		if err := dbc.DB.Where("name = ?", info.name).FirstOrCreate(&existingTest, testModel).Error; err != nil {
			return fmt.Errorf("failed to create Test %s: %w", info.name, err)
		}

		ownership := models.TestOwnership{
			UniqueID:     info.uniqueID,
			Name:         info.name,
			TestID:       existingTest.ID,
			Suite:        "synthetic",
			SuiteID:      &suite.ID,
			Component:    info.component,
			Capabilities: info.capabilities,
		}
		var existingOwnership models.TestOwnership
		if err := dbc.DB.Where("name = ? AND suite = ?", info.name, "synthetic").FirstOrCreate(&existingOwnership, ownership).Error; err != nil {
			return fmt.Errorf("failed to create TestOwnership for %s: %w", info.name, err)
		}
	}
	log.Infof("Created %d tests with ownership records", len(seenTests))
	return nil
}

type jobReleaseKey struct {
	jobTemplate string
	release     string
}

func seedJobRunsAndResults(dbc *db.DB) (int, int, error) {
	var suite models.Suite
	if err := dbc.DB.Where("name = ?", "synthetic").First(&suite).Error; err != nil {
		return 0, 0, fmt.Errorf("failed to find suite: %w", err)
	}

	maxRuns := map[jobReleaseKey]int{}
	for _, ts := range syntheticTests {
		for jobTpl, releaseCounts := range ts.jobCounts {
			for release, counts := range releaseCounts {
				key := jobReleaseKey{jobTpl, release}
				if counts.total > maxRuns[key] {
					maxRuns[key] = counts.total
				}
			}
		}
	}

	testIDsByName := map[string]uint{}
	var allTests []models.Test
	if err := dbc.DB.Find(&allTests).Error; err != nil {
		return 0, 0, fmt.Errorf("failed to fetch tests: %w", err)
	}
	for _, t := range allTests {
		testIDsByName[t.Name] = t.ID
	}

	totalRuns := 0
	totalResults := 0
	for jrKey, runCount := range maxRuns {
		if runCount == 0 {
			continue
		}

		jobName := fmt.Sprintf(jrKey.jobTemplate, jrKey.release)
		var prowJob models.ProwJob
		if err := dbc.DB.Where("name = ?", jobName).First(&prowJob).Error; err != nil {
			return 0, 0, fmt.Errorf("failed to find ProwJob %s: %w", jobName, err)
		}

		runs, results, err := seedRunsForJob(dbc, &suite, prowJob, jrKey, runCount, testIDsByName)
		if err != nil {
			return 0, 0, err
		}
		totalRuns += runs
		totalResults += results

		log.Debugf("Created %d runs for %s", runCount, jobName)
	}

	return totalRuns, totalResults, nil
}

func seedRunsForJob(dbc *db.DB, suite *models.Suite, prowJob models.ProwJob, jrKey jobReleaseKey, runCount int, testIDsByName map[string]uint) (int, int, error) {
	start, end := releaseTimeWindow(jrKey.release)
	window := end.Sub(start)
	infraRuns := 2
	totalRuns := runCount + infraRuns
	interval := window / time.Duration(totalRuns)
	runIDs := make([]uint, totalRuns)
	for i := range totalRuns {
		timestamp := start.Add(time.Duration(i) * interval)
		run := models.ProwJobRun{
			ProwJobID:      prowJob.ID,
			ProwJobRelease: prowJob.Release,
			Cluster:        "build01",
			Timestamp:      timestamp,
			Duration:       3 * time.Hour,
		}
		if err := dbc.DB.Create(&run).Error; err != nil {
			return 0, 0, fmt.Errorf("failed to create ProwJobRun: %w", err)
		}
		runIDs[i] = run.ID
	}

	runsWithFailure := map[uint]bool{}
	totalResults := 0

	for _, ts := range syntheticTests {
		releaseCounts, hasJob := ts.jobCounts[jrKey.jobTemplate]
		if !hasJob {
			continue
		}
		counts, hasRelease := releaseCounts[jrKey.release]
		if !hasRelease || counts.total == 0 {
			continue
		}

		testID, ok := testIDsByName[ts.testName]
		if !ok {
			return 0, 0, fmt.Errorf("test %q not found in DB", ts.testName)
		}

		for i := 0; i < counts.total && i < runCount; i++ {
			var status int
			switch {
			case i < counts.success-counts.flake:
				status = 1 // pass
			case i < counts.success:
				status = 13 // flake (counts as success too)
			default:
				status = 12 // failure
				runsWithFailure[runIDs[i]] = true
			}

			result := models.ProwJobRunTest{
				ProwJobRunID:        runIDs[i],
				ProwJobID:           prowJob.ID,
				ProwJobRunRelease:   prowJob.Release,
				ProwJobRunTimestamp: start.Add(time.Duration(i) * interval),
				TestID:              testID,
				SuiteID:             &suite.ID,
				Status:              status,
				Duration:            5.0,
				CreatedAt:           start.Add(time.Duration(i) * interval),
			}
			if err := dbc.DB.Create(&result).Error; err != nil {
				return 0, 0, fmt.Errorf("failed to create ProwJobRunTest: %w", err)
			}
			totalResults++
		}
	}

	// Set OverallResult on all runs
	for i, runID := range runIDs {
		var overallResult v1.JobOverallResult
		var succeeded, failed bool

		if i >= runCount {
			overallResult = v1.JobInternalInfrastructureFailure
			failed = true
		} else if runsWithFailure[runID] {
			overallResult = v1.JobTestFailure
			failed = true
		} else {
			overallResult = v1.JobSucceeded
			succeeded = true
		}

		updates := map[string]any{
			"overall_result":         overallResult,
			"succeeded":              succeeded,
			"failed":                 failed,
			"infrastructure_failure": i >= runCount,
		}
		if i >= runCount {
			updates["labels"] = pq.StringArray{"InfraFailure"}
		}

		if err := dbc.DB.Model(&models.ProwJobRun{}).
			Where("id = ? AND prow_job_release = ?", runID, prowJob.Release).
			Updates(updates).Error; err != nil {
			return 0, 0, fmt.Errorf("failed to update ProwJobRun result: %w", err)
		}
	}

	// Update test_failures and test_flakes counts
	if err := dbc.DB.Exec(`
		UPDATE prow_job_runs SET
			test_failures = COALESCE((
				SELECT COUNT(*) FROM prow_job_run_tests
				WHERE prow_job_run_id = prow_job_runs.id
				AND prow_job_run_release = prow_job_runs.prow_job_release
				AND status = ?
			), 0),
			test_flakes = COALESCE((
				SELECT COUNT(*) FROM prow_job_run_tests
				WHERE prow_job_run_id = prow_job_runs.id
				AND prow_job_run_release = prow_job_runs.prow_job_release
				AND status = ?
			), 0)
		WHERE prow_job_id = ? AND prow_job_release = ?`,
		int(v1.TestStatusFailure), int(v1.TestStatusFlake), prowJob.ID, prowJob.Release).Error; err != nil {
		return 0, 0, fmt.Errorf("updating test counts for prow job %s: %w", prowJob.Name, err)
	}

	return totalRuns, totalResults, nil
}

func syncRegressions(dbc *db.DB) error {
	provider := pgprovider.NewPostgresProvider(dbc, nil)
	ctx := context.Background()

	releases, err := provider.QueryReleases(ctx)
	if err != nil {
		return fmt.Errorf("querying releases: %w", err)
	}

	viewsData, err := os.ReadFile(syntheticViewsFile)
	if err != nil {
		return fmt.Errorf("reading views file: %w", err)
	}
	var views apitype.SippyViews
	if err := yaml.Unmarshal(viewsData, &views); err != nil {
		return fmt.Errorf("parsing views file: %w", err)
	}

	backend := componentreadiness.NewPostgresRegressionStore(dbc, nil)
	rLog := log.WithField("source", "seed-regression-sync")

	// Collect active regression IDs across all enabled views before closing
	// any. A regression that is active in one view must not be closed when
	// processing another view that does not include it.
	allActiveIDs := sets.New[uint]()
	activeViewMap := map[uint][]string{}

	for _, view := range views.ComponentReadiness {
		baseRelease, err := utils.GetViewReleaseOptions(releases, "basis", view.BaseRelease, 0, 0)
		if err != nil {
			return fmt.Errorf("error getting base release for view %s: %w", view.Name, err)
		}
		sampleRelease, err := utils.GetViewReleaseOptions(releases, "sample", view.SampleRelease, 0, 0)
		if err != nil {
			return fmt.Errorf("error getting sample release for view %s: %w", view.Name, err)
		}

		reportOpts := reqopts.RequestOptions{
			BaseRelease:    baseRelease,
			SampleRelease:  sampleRelease,
			VariantOption:  view.VariantOptions,
			AdvancedOption: view.AdvancedOptions,
		}

		report, reportErrs := componentreadiness.GetComponentReport(ctx, provider, dbc, reportOpts, "")
		if len(reportErrs) > 0 {
			for _, e := range reportErrs {
				rLog.WithError(e).Warn("report generation error")
			}
			return fmt.Errorf("error generating component report for view %s", view.Name)
		}

		activeRegs, err := componentreadiness.SyncRegressionsForReport(backend, view, rLog, &report)
		if err != nil {
			return fmt.Errorf("error syncing regressions for view %s: %w", view.Name, err)
		}
		for _, reg := range activeRegs {
			if err := backend.UpsertRegressionView(reg.ID, view.Name); err != nil {
				return fmt.Errorf("error upserting view %s for regression %d: %w", view.Name, reg.ID, err)
			}
			allActiveIDs.Insert(reg.ID)
			activeViewMap[reg.ID] = append(activeViewMap[reg.ID], view.Name)
		}

		rLog.Infof("synced regressions for view %s: %d active", view.Name, len(activeRegs))
	}

	// Close regressions that are not active in any enabled view.
	sampleRelease := views.ComponentReadiness[0].SampleRelease.Name
	allRegs, err := backend.ListCurrentRegressionsForRelease(sampleRelease)
	if err != nil {
		return fmt.Errorf("error listing regressions: %w", err)
	}
	now := time.Now()
	for _, reg := range allRegs {
		if !allActiveIDs.Has(reg.ID) && !reg.Closed.Valid {
			reg.Closed = sql.NullTime{Valid: true, Time: now}
			if err := backend.UpdateRegression(reg); err != nil {
				return fmt.Errorf("error closing regression %d: %w", reg.ID, err)
			}
		}
	}

	// Deactivate views that rolled off for active regressions.
	activeIDs := allActiveIDs.UnsortedList()
	if err := backend.DeactivateRolledOffViews(activeIDs, activeViewMap); err != nil {
		return fmt.Errorf("error deactivating rolled-off views: %w", err)
	}

	if err := backend.ResolveTriages(); err != nil {
		return fmt.Errorf("error resolving triages: %w", err)
	}

	return nil
}

func seedPresubmitData(dbc *db.DB) error {
	now := time.Now().UTC().Truncate(time.Hour)

	var suite models.Suite
	if err := dbc.DB.Where("name = ?", "synthetic").First(&suite).Error; err != nil {
		return fmt.Errorf("failed to find suite: %w", err)
	}

	// Look up existing test records to reuse
	testNames := []string{
		"install should succeed: overall",
		"[sig-network] Services should serve endpoints on same port and different protocol",
	}
	testsByName := map[string]uint{}
	for _, name := range testNames {
		var t models.Test
		if err := dbc.DB.Where("name = ?", name).First(&t).Error; err != nil {
			return fmt.Errorf("failed to find test %q: %w", name, err)
		}
		testsByName[name] = t.ID
	}

	// Create presubmit ProwJobs
	presubmitJobs := []models.ProwJob{
		{
			Kind:    models.ProwKind("presubmit"),
			Name:    "openshift-origin-ci-5.0-e2e-aws-ovn-upgrade",
			Release: models.ReleasePresubmits,
			Variants: pq.StringArray{
				"Architecture:amd64", "FeatureSet:default", "Installer:ipi",
				"LayeredProduct:none", "Network:ovn", "Platform:aws",
				"Suite:unknown", "Topology:ha", "Upgrade:minor",
			},
		},
		{
			Kind:    models.ProwKind("presubmit"),
			Name:    "openshift-origin-ci-5.0-e2e-gcp-ovn-amd64",
			Release: models.ReleasePresubmits,
			Variants: pq.StringArray{
				"Architecture:amd64", "FeatureSet:default", "Installer:ipi",
				"LayeredProduct:none", "Network:ovn", "Platform:gcp",
				"Suite:parallel", "Topology:ha", "Upgrade:none",
			},
		},
	}

	for i, pj := range presubmitJobs {
		if err := dbc.DB.Create(&pj).Error; err != nil {
			return fmt.Errorf("failed to create presubmit ProwJob %s: %w", pj.Name, err)
		}
		presubmitJobs[i] = pj
	}

	// Create ProwPullRequests
	// PR 99001 has two SHAs to exercise the latest_sha_only filter: an older
	// SHA linked to the earliest run, and a newer SHA linked to the rest.
	prs := []models.ProwPullRequest{
		{
			Org:    "openshift",
			Repo:   "origin",
			Number: 99001,
			Author: "test-author-1",
			Title:  "Test PR 99001",
			SHA:    "abc123def456",
			Link:   "https://github.com/openshift/origin/pull/99001",
		},
		{
			Org:    "openshift",
			Repo:   "origin",
			Number: 99002,
			Author: "test-author-2",
			Title:  "Test PR 99002",
			SHA:    "789abc012def",
			Link:   "https://github.com/openshift/origin/pull/99002",
		},
	}
	oldSHAPR := models.ProwPullRequest{
		Org:    "openshift",
		Repo:   "origin",
		Number: 99001,
		Author: "test-author-1",
		Title:  "Test PR 99001",
		SHA:    "old111old222",
		Link:   "https://github.com/openshift/origin/pull/99001?old=1",
	}

	for i, pr := range prs {
		if err := dbc.DB.Create(&pr).Error; err != nil {
			return fmt.Errorf("failed to create ProwPullRequest %d: %w", pr.Number, err)
		}
		prs[i] = pr
	}
	if err := dbc.DB.Create(&oldSHAPR).Error; err != nil {
		return fmt.Errorf("failed to create old-SHA ProwPullRequest: %w", err)
	}

	// Create runs: 3 runs per job, PR 99001 gets job[0] runs, PR 99002 gets job[1] runs
	type runInfo struct {
		run   models.ProwJobRun
		prIdx int
	}
	var runs []runInfo

	for jobIdx, pj := range presubmitJobs {
		for i := 0; i < 3; i++ {
			timestamp := now.Add(-time.Duration(3-i) * 20 * time.Hour)
			run := models.ProwJobRun{
				ProwJobID:      pj.ID,
				ProwJobRelease: models.ReleasePresubmits,
				Cluster:        "build01",
				Timestamp:      timestamp,
				Duration:       2 * time.Hour,
				OverallResult:  v1.JobTestFailure,
				Failed:         true,
			}
			if err := dbc.DB.Create(&run).Error; err != nil {
				return fmt.Errorf("failed to create ProwJobRun: %w", err)
			}
			runs = append(runs, runInfo{run: run, prIdx: jobIdx})
		}
	}

	// Link runs to PRs via join table.
	// The first run of job[0] (oldest for PR 99001) links to oldSHAPR so that
	// the latest_sha_only filter has something to exclude.
	for runIdx, ri := range runs {
		prID := prs[ri.prIdx].ID
		if ri.prIdx == 0 && runIdx == 0 {
			prID = oldSHAPR.ID
		}
		jrpr := models.ProwJobRunProwPullRequest{
			ProwJobRunID:        ri.run.ID,
			ProwPullRequestID:   prID,
			ProwJobRunRelease:   models.ReleasePresubmits,
			ProwJobRunTimestamp: ri.run.Timestamp,
		}
		if err := dbc.DB.Create(&jrpr).Error; err != nil {
			return fmt.Errorf("failed to create ProwJobRunProwPullRequest: %w", err)
		}
	}

	// Create test results with mixed statuses
	installTestID := testsByName["install should succeed: overall"]
	networkTestID := testsByName["[sig-network] Services should serve endpoints on same port and different protocol"]

	for _, ri := range runs {
		// Failure result for install test
		failResult := models.ProwJobRunTest{
			ProwJobRunID:        ri.run.ID,
			ProwJobID:           ri.run.ProwJobID,
			ProwJobRunRelease:   models.ReleasePresubmits,
			ProwJobRunTimestamp: ri.run.Timestamp,
			TestID:              installTestID,
			SuiteID:             &suite.ID,
			Status:              int(v1.TestStatusFailure),
			Duration:            5.0,
			CreatedAt:           ri.run.Timestamp,
		}
		if err := dbc.DB.Create(&failResult).Error; err != nil {
			return fmt.Errorf("failed to create failure ProwJobRunTest: %w", err)
		}

		// Add output for the first failure only
		if ri.prIdx == 0 && ri.run.Timestamp.Equal(runs[0].run.Timestamp) {
			output := models.ProwJobRunTestOutput{
				ProwJobRunTestID:        failResult.ID,
				Output:                  "Expected install to succeed but got timeout after 30m",
				ProwJobRunTestTimestamp: ri.run.Timestamp,
				ProwJobRunTestRelease:   models.ReleasePresubmits,
			}
			if err := dbc.DB.Create(&output).Error; err != nil {
				return fmt.Errorf("failed to create ProwJobRunTestOutput: %w", err)
			}
		}

		// Success result for network test
		successResult := models.ProwJobRunTest{
			ProwJobRunID:        ri.run.ID,
			ProwJobID:           ri.run.ProwJobID,
			ProwJobRunRelease:   models.ReleasePresubmits,
			ProwJobRunTimestamp: ri.run.Timestamp,
			TestID:              networkTestID,
			SuiteID:             &suite.ID,
			Status:              int(v1.TestStatusSuccess),
			Duration:            3.0,
			CreatedAt:           ri.run.Timestamp,
		}
		if err := dbc.DB.Create(&successResult).Error; err != nil {
			return fmt.Errorf("failed to create success ProwJobRunTest: %w", err)
		}

		// Success result for install test (used by include_successes=install e2e test)
		installSuccessResult := models.ProwJobRunTest{
			ProwJobRunID:        ri.run.ID,
			ProwJobID:           ri.run.ProwJobID,
			ProwJobRunRelease:   models.ReleasePresubmits,
			ProwJobRunTimestamp: ri.run.Timestamp,
			TestID:              installTestID,
			SuiteID:             &suite.ID,
			Status:              int(v1.TestStatusSuccess),
			Duration:            2.0,
			CreatedAt:           ri.run.Timestamp,
		}
		if err := dbc.DB.Create(&installSuccessResult).Error; err != nil {
			return fmt.Errorf("failed to create install success ProwJobRunTest: %w", err)
		}

		// Flake result for install test
		flakeResult := models.ProwJobRunTest{
			ProwJobRunID:        ri.run.ID,
			ProwJobID:           ri.run.ProwJobID,
			ProwJobRunRelease:   models.ReleasePresubmits,
			ProwJobRunTimestamp: ri.run.Timestamp,
			TestID:              installTestID,
			SuiteID:             &suite.ID,
			Status:              int(v1.TestStatusFlake),
			Duration:            4.0,
			CreatedAt:           ri.run.Timestamp,
		}
		if err := dbc.DB.Create(&flakeResult).Error; err != nil {
			return fmt.Errorf("failed to create flake ProwJobRunTest: %w", err)
		}
	}

	log.Infof("Created presubmit seed data: %d jobs, %d PRs, %d runs", len(presubmitJobs), len(prs), len(runs))
	return nil
}

const syntheticViewsFile = "config/seed-views.yaml"

// variantMapToArray converts a variant map to a pq.StringArray.
func variantMapToArray(m map[string]string) pq.StringArray {
	result := make([]string, 0, len(m))
	for k, v := range m {
		result = append(result, k+":"+v)
	}
	sort.Strings(result)
	return result
}

func createTestSuite(dbc *db.DB, name string) error {
	suite := models.Suite{
		Name: name,
	}

	var existingSuite models.Suite
	if err := dbc.DB.Where("name = ?", suite.Name).FirstOrCreate(&existingSuite, suite).Error; err != nil {
		return fmt.Errorf("failed to create or find Suite %s: %v", suite.Name, err)
	}

	return nil
}

func createLabelsAndSymptoms(dbc *db.DB) error {
	metadata := jobrunscan.Metadata{
		CreatedBy: "seed-data",
		UpdatedBy: "seed-data",
	}

	labels := []jobrunscan.Label{
		{
			LabelContent: jobrunscan.LabelContent{
				ID:          "InfraFailure",
				LabelTitle:  "Infrastructure failure: omit job from CR",
				Explanation: "Job failed due to **infrastructure issues** not related to product code.",
			},
			Metadata: metadata,
		},
		{
			LabelContent: jobrunscan.LabelContent{
				ID:          "ClusterDNSFlake",
				LabelTitle:  "Cluster DNS resolution failure(s)",
				Explanation: "Job experienced DNS resolution timeouts in the cluster.",
			},
			Metadata: metadata,
		},
		{
			LabelContent: jobrunscan.LabelContent{
				ID:          "ClusterInstallTimeout",
				LabelTitle:  "Cluster install timeout",
				Explanation: "Cluster installation exceeded timeout threshold.",
			},
			Metadata: metadata,
		},
		{
			LabelContent: jobrunscan.LabelContent{
				ID:          "IntervalFile",
				LabelTitle:  "Has interval file(s)",
				Explanation: "Job produced interval monitoring files.",
			},
			HideDisplayContexts: []string{jobrunscan.MetricsContext, jobrunscan.JAQOptsContext},
			Metadata:            metadata,
		},
		{
			LabelContent: jobrunscan.LabelContent{
				ID:          "APIServerTimeout",
				LabelTitle:  "API server timeout",
				Explanation: "Requests to the API server timed out.",
			},
			Metadata: metadata,
		},
	}

	for _, label := range labels {
		var existing jobrunscan.Label
		if err := dbc.DB.Where("id = ?", label.ID).FirstOrCreate(&existing, label).Error; err != nil {
			return fmt.Errorf("failed to create or find label %s: %v", label.ID, err)
		}
	}

	symptoms := []jobrunscan.Symptom{
		{
			SymptomContent: jobrunscan.SymptomContent{
				ID:          "DNSTimeoutSymptom",
				Summary:     "Cluster DNS resolution failures detected",
				MatcherType: jobrunscan.MatcherTypeString,
				FilePattern: "**/e2e-timelines/**/*.json",
				MatchString: "dial tcp",
				LabelIDs:    []string{"ClusterDNSFlake"},
			},
			Metadata: metadata,
		},
		{
			SymptomContent: jobrunscan.SymptomContent{
				ID:          "InstallTimeoutSymptom",
				Summary:     "Cluster install timeout detected",
				MatcherType: jobrunscan.MatcherTypeRegex,
				FilePattern: "**/build-log.txt",
				MatchString: "timeout waiting for.*install",
				LabelIDs:    []string{"ClusterInstallTimeout"},
			},
			Metadata: metadata,
		},
		{
			SymptomContent: jobrunscan.SymptomContent{
				ID:          "HasIntervalsSymptom",
				Summary:     "Has interval file(s)",
				MatcherType: jobrunscan.MatcherTypeFile,
				FilePattern: "**/intervals*.json",
				MatchString: "",
				LabelIDs:    []string{"IntervalFile"},
			},
			Metadata: metadata,
		},
		{
			SymptomContent: jobrunscan.SymptomContent{
				ID:          "APITimeoutSymptom",
				Summary:     "API server timeouts detected",
				MatcherType: jobrunscan.MatcherTypeString,
				FilePattern: "**/build-log.txt",
				MatchString: "context deadline exceeded",
				LabelIDs:    []string{"APIServerTimeout"},
			},
			Metadata: metadata,
		},
	}

	for _, symptom := range symptoms {
		var existing jobrunscan.Symptom
		if err := dbc.DB.Where("id = ?", symptom.ID).FirstOrCreate(&existing, symptom).Error; err != nil {
			return fmt.Errorf("failed to create or find symptom %s: %v", symptom.ID, err)
		}
	}

	return nil
}

func seedFeatureGates(dbc *db.DB) error {
	featureGates := []models.FeatureGate{
		{Release: "4.22", Topology: "SelfManagedHA", FeatureSet: "TechPreviewNoUpgrade", FeatureGate: "NetworkSegmentation", Status: "enabled"},
		{Release: "4.22", Topology: "SelfManagedHA", FeatureSet: "TechPreviewNoUpgrade", FeatureGate: "AWSDualStackInstall", Status: "enabled"},
		{Release: "4.22", Topology: "SelfManagedHA", FeatureSet: "TechPreviewNoUpgrade", FeatureGate: "UnpromotedTestGate", Status: "enabled"},
		{Release: "4.22", Topology: "SelfManagedHA", FeatureSet: "Default", FeatureGate: "PromotedTestGate", Status: "enabled"},
	}

	for _, fg := range featureGates {
		var existing models.FeatureGate
		if err := dbc.DB.Where(
			"release = ? AND topology = ? AND feature_set = ? AND feature_gate = ?",
			fg.Release, fg.Topology, fg.FeatureSet, fg.FeatureGate,
		).FirstOrCreate(&existing, fg).Error; err != nil {
			return fmt.Errorf("failed to create feature gate %s/%s: %w", fg.Release, fg.FeatureGate, err)
		}
	}
	log.Infof("Created %d feature gate records", len(featureGates))
	return nil
}

// seedGARawTestData populates prow_ga_raw_test_data for GA releases using
// the same synthetic test/job definitions.
func seedGARawTestData(dbc *db.DB) error {
	var gaReleases []models.ReleaseDefinition
	if err := dbc.DB.Where("ga_date IS NOT NULL AND ga_date < CURRENT_DATE").Find(&gaReleases).Error; err != nil {
		return fmt.Errorf("querying GA releases: %w", err)
	}

	if len(gaReleases) == 0 {
		log.Info("No GA releases found, skipping GA raw test data seeding")
		return nil
	}

	testIDCache := make(map[string]uint)
	jobIDCache := make(map[string]uint)
	var suiteID uint

	var suite models.Suite
	if err := dbc.DB.Where("name = ?", "synthetic").First(&suite).Error; err != nil {
		if !stderrors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("looking up suite 'synthetic': %w", err)
		}
		log.Warn("Suite 'synthetic' not found, GA raw test data will use suite_id=0")
	} else {
		suiteID = suite.ID
	}

	var rows []models.ProwGARawTestDatum
	for _, rel := range gaReleases {
		for _, windowDays := range utils.GAWindows {
			for _, spec := range syntheticTests {
				testID, ok := testIDCache[spec.testName]
				if !ok {
					var test models.Test
					if err := dbc.DB.Where("name = ?", spec.testName).First(&test).Error; err != nil {
						if !stderrors.Is(err, gorm.ErrRecordNotFound) {
							return fmt.Errorf("looking up test %q: %w", spec.testName, err)
						}
						continue
					}
					testID = test.ID
					testIDCache[spec.testName] = testID
				}

				for jobTemplate, releaseCounts := range spec.jobCounts {
					counts, ok := releaseCounts[rel.Release]
					if !ok {
						continue
					}
					jobName := fmt.Sprintf(jobTemplate, rel.Release)
					prowJobID, ok := jobIDCache[jobName]
					if !ok {
						var job models.ProwJob
						if err := dbc.DB.Where("name = ?", jobName).First(&job).Error; err != nil {
							if !stderrors.Is(err, gorm.ErrRecordNotFound) {
								return fmt.Errorf("looking up prow job %q: %w", jobName, err)
							}
							continue
						}
						prowJobID = job.ID
						jobIDCache[jobName] = prowJobID
					}

					scale := int64(windowDays)
					rows = append(rows, models.ProwGARawTestDatum{
						Release:    rel.Release,
						WindowDays: windowDays,
						TestID:     testID,
						ProwJobID:  prowJobID,
						SuiteID:    suiteID,
						Passes:     int64(counts.success) * scale,
						Failures:   int64(counts.total-counts.success-counts.flake) * scale,
						Flakes:     int64(counts.flake) * scale,
						Runs:       int64(counts.total) * scale,
					})
				}
			}
		}
	}

	if len(rows) > 0 {
		if err := dbc.DB.CreateInBatches(rows, 500).Error; err != nil {
			return fmt.Errorf("inserting GA raw test data: %w", err)
		}
	}

	releasesWithRows := sets.New[string]()
	for _, row := range rows {
		releasesWithRows.Insert(row.Release)
	}

	for _, rel := range gaReleases {
		if !releasesWithRows.Has(rel.Release) {
			log.WithField("release", rel.Release).Warn("No GA seed data generated, skipping ga_data_loaded_date")
			continue
		}
		if rel.GADate == nil {
			return fmt.Errorf("release %s has nil GA date", rel.Release)
		}
		gaDate := *rel.GADate
		if err := dbc.DB.Model(&models.ReleaseDefinition{}).
			Where("release = ?", rel.Release).
			Update("ga_data_loaded_date", gaDate).Error; err != nil {
			return fmt.Errorf("updating ga_data_loaded_date for %s: %w", rel.Release, err)
		}
	}

	log.WithField("rows", len(rows)).
		WithField("releases", len(gaReleases)).
		Info("Seeded GA raw test data")
	return nil
}

// seedReleasePayloadTags creates release payload tags (ReleaseTag) with linked
// job runs, pull requests, and repository data for multiple releases and streams.
// Accepted payloads reference an earlier Accepted payload from the same stream as
// PreviousReleaseTag.
func seedReleasePayloadTags(dbc *db.DB) error {
	now := time.Now().UTC().Truncate(time.Hour)

	type payloadDef struct {
		release string
		stream  string
		arch    string
		tags    []struct {
			suffix string
			phase  string
			age    time.Duration
		}
	}

	defs := []payloadDef{
		{
			release: "4.22", stream: "nightly", arch: "amd64",
			tags: []struct {
				suffix string
				phase  string
				age    time.Duration
			}{
				{"2026-10-27-010101", "Accepted", 48 * time.Hour},
				{"2026-10-28-020202", "Rejected", 24 * time.Hour},
				{"2026-10-29-030303", "Accepted", 1 * time.Hour},
			},
		},
		{
			release: "4.22", stream: "ci", arch: "amd64",
			tags: []struct {
				suffix string
				phase  string
				age    time.Duration
			}{
				{"2026-10-26-100000", "Accepted", 72 * time.Hour},
				{"2026-10-28-120000", "Rejected", 20 * time.Hour},
			},
		},
		{
			release: "4.21", stream: "nightly", arch: "amd64",
			tags: []struct {
				suffix string
				phase  string
				age    time.Duration
			}{
				{"2026-09-20-050505", "Accepted", 40 * 24 * time.Hour},
				{"2026-09-25-060606", "Accepted", 35 * 24 * time.Hour},
			},
		},
	}

	prCounter := 0
	for _, def := range defs {
		var prevAcceptedTag string
		for _, tagDef := range def.tags {
			tagName := fmt.Sprintf("%s.0-0.%s-%s", def.release, def.stream, tagDef.suffix)
			releaseTime := now.Add(-tagDef.age)

			rt := models.ReleaseTag{
				ReleaseTag:         tagName,
				Release:            def.release,
				Stream:             def.stream,
				Architecture:       def.arch,
				Phase:              tagDef.phase,
				ReleaseTime:        releaseTime,
				PreviousReleaseTag: prevAcceptedTag,
				KubernetesVersion:  "v1.29.0",
				CurrentOSVersion:   "418.94.202610150832-0",
			}

			if tagDef.phase == "Rejected" {
				rt.RejectReason = "TestFailure"
				rt.RejectReasonNote = "Seed data: simulated test failure"
				rt.RejectReasons = pq.StringArray{"TestFailure"}
			}

			if err := dbc.DB.Create(&rt).Error; err != nil {
				return fmt.Errorf("creating release tag %s: %w", tagName, err)
			}

			// Link pull requests
			prCounter++
			pr := models.ReleasePullRequest{
				URL:           fmt.Sprintf("https://github.com/openshift/origin/pull/%d", 80000+prCounter),
				PullRequestID: fmt.Sprintf("%d", 80000+prCounter),
				Name:          "openshift/origin",
				Description:   fmt.Sprintf("Seed PR for payload %s", tagName),
			}
			if err := dbc.DB.Create(&pr).Error; err != nil {
				return fmt.Errorf("creating release pull request: %w", err)
			}
			if err := dbc.DB.Exec(
				"INSERT INTO release_tag_pull_requests (release_tag_id, release_pull_request_id) VALUES (?, ?)",
				rt.ID, pr.ID,
			).Error; err != nil {
				return fmt.Errorf("linking release tag to pull request: %w", err)
			}

			// Link repository
			repo := models.ReleaseRepository{
				Name:         "openshift/origin",
				ReleaseTagID: fmt.Sprintf("%d", rt.ID),
				Head:         fmt.Sprintf("abc%04d", prCounter),
				DiffURL:      fmt.Sprintf("https://github.com/openshift/origin/compare/abc0000...abc%04d", prCounter),
			}
			if err := dbc.DB.Create(&repo).Error; err != nil {
				return fmt.Errorf("creating release repository: %w", err)
			}

			// Link job runs
			jobRunStates := []struct {
				name  string
				state string
			}{
				{fmt.Sprintf("periodic-ci-openshift-release-%s-e2e-aws-ovn-amd64", def.release), "Succeeded"},
				{fmt.Sprintf("periodic-ci-openshift-release-%s-e2e-gcp-ovn-amd64", def.release), "Succeeded"},
			}
			if tagDef.phase == "Rejected" {
				jobRunStates[1] = struct {
					name  string
					state string
				}{jobRunStates[1].name, "Failed"}
			}
			for i, jrs := range jobRunStates {
				rjr := models.ReleaseJobRun{
					ReleaseTagID:   fmt.Sprintf("%d", rt.ID),
					Name:           uint(90000 + prCounter*10 + i),
					JobName:        jrs.name,
					Kind:           "periodic",
					State:          jrs.state,
					TransitionTime: releaseTime.Add(time.Duration(i) * time.Hour),
					URL:            fmt.Sprintf("https://prow.ci.openshift.org/view/gs/test-bucket/%d", 90000+prCounter*10+i),
				}
				if err := dbc.DB.Create(&rjr).Error; err != nil {
					return fmt.Errorf("creating release job run: %w", err)
				}
			}

			if tagDef.phase == "Accepted" {
				prevAcceptedTag = tagName
			}
		}
	}

	log.WithField("defs", len(defs)).Info("Created release payload tags with job runs, PRs, and repos")
	return nil
}

// seedPeriodicTestOutputs adds ProwJobRunTestOutput records for periodic test
// failures in the 4.22 release so the /api/tests/outputs endpoint has data to
// return.
func seedPeriodicTestOutputs(dbc *db.DB) error {
	// Find a periodic 4.22 test with failures.
	testName := "[sig-network] Services should serve endpoints on same port and different protocol"
	var test models.Test
	if err := dbc.DB.Where("name = ?", testName).First(&test).Error; err != nil {
		return fmt.Errorf("looking up test %q: %w", testName, err)
	}

	var failedResults []models.ProwJobRunTest
	if err := dbc.DB.
		Where("test_id = ? AND prow_job_run_release = ? AND status = ?", test.ID, "4.22", int(v1.TestStatusFailure)).
		Order("prow_job_run_timestamp DESC").
		Limit(3).
		Find(&failedResults).Error; err != nil {
		return fmt.Errorf("finding failed test results: %w", err)
	}

	outputs := []string{
		"Expected service to serve endpoints on port 80/TCP and 80/UDP but got connection refused after 30s",
		"Timed out waiting for service endpoint to become ready: context deadline exceeded",
		"Service load balancer did not program endpoints within timeout, last error: dial tcp 10.0.0.1:80: connect: connection refused",
	}

	for i, result := range failedResults {
		output := models.ProwJobRunTestOutput{
			ProwJobRunTestID:        result.ID,
			Output:                  outputs[i%len(outputs)],
			ProwJobRunTestTimestamp: result.ProwJobRunTimestamp,
			ProwJobRunTestRelease:   "4.22",
		}
		if err := dbc.DB.Create(&output).Error; err != nil {
			return fmt.Errorf("creating test output: %w", err)
		}
	}

	log.WithField("outputs", len(failedResults)).Info("Created periodic test outputs")
	return nil
}

// seedBugsAndTriages creates Bug records, Triage records linked to seeded
// regressions, and RegressionJobRun records. It must be called after
// syncRegressions so that regressions exist in the database.
func seedBugsAndTriages(dbc *db.DB) error {
	// Create bugs
	bugs := []models.Bug{
		{
			Key:             "OCPBUGS-99001",
			Status:          "New",
			Summary:         "etcd leader changes cause excessive latency during upgrade",
			Components:      pq.StringArray{"etcd"},
			Labels:          pq.StringArray{"UpgradeBlocker"},
			URL:             "https://redhat.atlassian.net/browse/OCPBUGS-99001",
			AffectsVersions: pq.StringArray{"4.22"},
			TargetVersions:  pq.StringArray{"4.22"},
		},
		{
			Key:             "OCPBUGS-99002",
			Status:          "In Progress",
			Summary:         "Network services endpoint routing regression on arm64",
			Components:      pq.StringArray{"Networking"},
			Labels:          pq.StringArray{"Regression"},
			URL:             "https://redhat.atlassian.net/browse/OCPBUGS-99002",
			AffectsVersions: pq.StringArray{"4.22"},
			TargetVersions:  pq.StringArray{"4.22"},
		},
	}
	for i := range bugs {
		if err := dbc.DB.Create(&bugs[i]).Error; err != nil {
			return fmt.Errorf("creating bug %s: %w", bugs[i].Key, err)
		}
	}

	// Load seeded regressions.
	var regressions []models.TestRegression
	if err := dbc.DB.Preload("Views").Where("release = ?", "4.22").Find(&regressions).Error; err != nil {
		return fmt.Errorf("loading regressions: %w", err)
	}
	if len(regressions) == 0 {
		log.Warn("No regressions found for 4.22, skipping triage/bug seeding")
		return nil
	}

	regByTestID := map[string]*models.TestRegression{}
	for i := range regressions {
		regByTestID[regressions[i].TestID] = &regressions[i]
	}

	// Add regression job runs to some regressions.
	extremeReg := regByTestID["test-extreme-regression"]
	sigReg := regByTestID["test-significant-regression"]

	backend := componentreadiness.NewPostgresRegressionStore(dbc, nil)

	if extremeReg != nil {
		if err := backend.MergeJobRuns(extremeReg.ID, []models.RegressionJobRun{
			{ProwJobRunID: "seed-run-extreme-1", ProwJobName: "periodic-ci-openshift-release-master-ci-4.22-e2e-aws-ovn-amd64", ProwJobURL: "https://prow.ci/seed-extreme-1", StartTime: time.Now().Add(-48 * time.Hour), TestFailed: true, TestFailures: 5, JobLabels: pq.StringArray{"ClusterDNSFlake"}},
			{ProwJobRunID: "seed-run-extreme-2", ProwJobName: "periodic-ci-openshift-release-master-ci-4.22-e2e-aws-ovn-amd64", ProwJobURL: "https://prow.ci/seed-extreme-2", StartTime: time.Now().Add(-24 * time.Hour), TestFailed: true, TestFailures: 3, JobSymptoms: pq.StringArray{"DNSTimeoutSymptom"}},
			{ProwJobRunID: "seed-run-extreme-3", ProwJobName: "periodic-ci-openshift-release-master-ci-4.22-e2e-aws-ovn-arm64", ProwJobURL: "https://prow.ci/seed-extreme-3", StartTime: time.Now().Add(-12 * time.Hour), TestFailed: true, TestFailures: 4},
		}); err != nil {
			return fmt.Errorf("merging job runs for extreme regression: %w", err)
		}
	}

	if sigReg != nil {
		if err := backend.MergeJobRuns(sigReg.ID, []models.RegressionJobRun{
			{ProwJobRunID: "seed-run-sig-1", ProwJobName: "periodic-ci-openshift-release-master-ci-4.22-e2e-aws-ovn-amd64", ProwJobURL: "https://prow.ci/seed-sig-1", StartTime: time.Now().Add(-36 * time.Hour), TestFailed: true, TestFailures: 8},
			{ProwJobRunID: "seed-run-sig-2", ProwJobName: "periodic-ci-openshift-release-master-ci-4.22-e2e-aws-ovn-amd64", ProwJobURL: "https://prow.ci/seed-sig-2", StartTime: time.Now().Add(-18 * time.Hour), TestFailed: false, TestFailures: 0},
		}); err != nil {
			return fmt.Errorf("merging job runs for significant regression: %w", err)
		}
	}

	// Create triage records. The extreme regression appears in both views
	// (4.22-main and 4.22-arm64), so this triage spans both views.
	dbCtx := dbc.DB.WithContext(context.WithValue(context.Background(), models.CurrentUserKey, "seed-data"))

	var triageRegressions []models.TestRegression
	if extremeReg != nil {
		triageRegressions = append(triageRegressions, *extremeReg)
	}
	if sigReg != nil {
		triageRegressions = append(triageRegressions, *sigReg)
	}

	if len(triageRegressions) > 0 {
		triage := models.Triage{
			URL:         bugs[0].URL,
			Bug:         &bugs[0],
			BugID:       &bugs[0].ID,
			Description: "etcd leader changes causing multiple regressions across platforms",
			Type:        models.TriageTypeProduct,
			Regressions: triageRegressions,
		}
		if err := dbCtx.Create(&triage).Error; err != nil {
			return fmt.Errorf("creating triage: %w", err)
		}
		log.WithField("triageID", triage.ID).
			WithField("regressions", len(triageRegressions)).
			Info("Created seed triage record")

		// Sync triage symptoms from the job runs we merged above.
		var regsForSync []*models.TestRegression
		for i := range triageRegressions {
			regsForSync = append(regsForSync, &triageRegressions[i])
		}
		if err := backend.SyncTriageSymptoms(regsForSync); err != nil {
			return fmt.Errorf("syncing triage symptoms: %w", err)
		}
	}

	log.WithField("bugs", len(bugs)).Info("Created seed bugs and triages")
	return nil
}
