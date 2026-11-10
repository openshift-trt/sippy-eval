package e2e

import (
	"net/url"
	"testing"

	"github.com/openshift/sippy/pkg/apis/api"
	"github.com/openshift/sippy/pkg/db/models"
	"github.com/openshift/sippy/test/e2e/util"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const seededPayloadOutputTestName = "[sig-network] periodic payload test output is available"

func TestSeededReleasePayloadAPIs(t *testing.T) {
	var tags []models.ReleaseTag
	err := util.SippyGet("/api/releases/tags?release=4.22&limit=100", &tags)
	require.NoError(t, err)
	require.NotEmpty(t, tags, "seeded payload tags should be available through the release tags API")
	assertSeededPayloadCoverage(t, tags)

	var rejectedNightly *models.ReleaseTag
	for i := range tags {
		tag := &tags[i]
		if tag.Release != "4.22" || tag.Stream != "nightly" || tag.Architecture != "amd64" {
			continue
		}
		if tag.Phase == "Rejected" {
			rejectedNightly = tag
		}
	}
	require.NotNil(t, rejectedNightly, "a rejected 4.22 nightly payload should be seeded")
	var previousAccepted *models.ReleaseTag
	for i := range tags {
		tag := &tags[i]
		if tag.ReleaseTag == rejectedNightly.PreviousReleaseTag && tag.Release == rejectedNightly.Release &&
			tag.Stream == rejectedNightly.Stream && tag.Architecture == rejectedNightly.Architecture && tag.Phase == "Accepted" {
			previousAccepted = tag
			break
		}
	}
	require.NotNil(t, previousAccepted, "an accepted 4.22 nightly payload should be seeded")
	assert.Equal(t, previousAccepted.ReleaseTag, rejectedNightly.PreviousReleaseTag)
	assert.True(t, previousAccepted.ReleaseTime.Before(rejectedNightly.ReleaseTime))

	var payloadRuns []models.ReleaseJobRun
	err = util.SippyGet("/api/releases/job_runs?release=4.22&limit=100", &payloadRuns)
	require.NoError(t, err)
	require.NotEmpty(t, payloadRuns, "seeded payload job runs should be available through the release job runs API")
	var hasFailedPeriodicRun bool
	for _, run := range payloadRuns {
		if run.JobName == "periodic-ci-openshift-release-master-ci-4.22-e2e-aws-ovn-amd64" && run.State == "Failed" {
			hasFailedPeriodicRun = true
			break
		}
	}
	assert.True(t, hasFailedPeriodicRun, "the rejected payload should link to a failed periodic job run")

	var pullRequests []models.ReleasePullRequest
	path := "/api/payloads/diff?toPayload=" + url.QueryEscape(rejectedNightly.ReleaseTag)
	err = util.SippyGet(path, &pullRequests)
	require.NoError(t, err)
	require.Len(t, pullRequests, 1, "the rejected payload should have one new pull request compared with its previous accepted payload")
	assert.Contains(t, pullRequests[0].URL, "/pull/")
}

func assertSeededPayloadCoverage(t *testing.T, tags422 []models.ReleaseTag) {
	t.Helper()
	var has422CIAccepted bool
	var has422CIRejected bool
	for _, tag := range tags422 {
		if tag.Stream != "ci" {
			continue
		}
		has422CIAccepted = has422CIAccepted || tag.Phase == "Accepted"
		has422CIRejected = has422CIRejected || tag.Phase == "Rejected"
	}
	assert.True(t, has422CIAccepted && has422CIRejected, "4.22 should have accepted and rejected CI payloads")

	var tags421 []models.ReleaseTag
	err := util.SippyGet("/api/releases/tags?release=4.21&limit=100", &tags421)
	require.NoError(t, err)
	var has421NightlyAccepted bool
	var has421NightlyRejected bool
	var has421CIAccepted bool
	var has421CIRejected bool
	for _, tag := range tags421 {
		switch tag.Stream + "/" + tag.Phase {
		case "nightly/Accepted":
			has421NightlyAccepted = true
		case "nightly/Rejected":
			has421NightlyRejected = true
		case "ci/Accepted":
			has421CIAccepted = true
		case "ci/Rejected":
			has421CIRejected = true
		}
	}
	assert.True(t, has421NightlyAccepted && has421NightlyRejected && has421CIAccepted && has421CIRejected,
		"4.21 should have accepted and rejected payloads in both streams")
}

func TestSeededPeriodicPayloadTestOutputAPI(t *testing.T) {
	path := "/api/tests/outputs?release=4.22&test=" + url.QueryEscape(seededPayloadOutputTestName)
	var outputs []api.TestOutput
	err := util.SippyGet(path, &outputs)
	require.NoError(t, err)
	require.NotEmpty(t, outputs, "seeded failed periodic test output should be available through the test output API")
	assert.Contains(t, outputs[0].Output, "Synthetic periodic test failure")
	assert.Contains(t, outputs[0].ProwJobURL, "/view/gs/seed/")
}
