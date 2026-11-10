package e2e

import (
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openshift/sippy/pkg/apis/api"
	"github.com/openshift/sippy/pkg/db/models"
	"github.com/openshift/sippy/test/e2e/util"
	"k8s.io/apimachinery/pkg/util/sets"
)

func TestReleasesAPI(t *testing.T) {
	var releases api.Releases
	err := util.SippyGet("/api/releases", &releases)
	require.NoError(t, err)

	t.Logf("found %d releases", len(releases.Releases))
	assert.Greater(t, len(releases.Releases), 0, "no releases returned")
}

func TestReleaseHealth(t *testing.T) {
	var health api.Health
	err := util.SippyGet("/api/health?release="+util.Release, &health)
	require.NoError(t, err)

	assert.Greater(t, health.Indicators["bootstrap"].CurrentRuns, 0, "no bootstrap runs")
	assert.Greater(t, health.Indicators["infrastructure"].CurrentRuns, 0, "no infrastructure runs")
	assert.Greater(t, health.Indicators["install"].CurrentRuns, 0, "no install runs")
	assert.Greater(t, health.Indicators["installConfig"].CurrentRuns, 0, "no installConfig runs")
	assert.Greater(t, health.Indicators["installOther"].CurrentRuns, 0, "no installOther runs")
	assert.Greater(t, health.Indicators["tests"].CurrentRuns, 0, "no tests runs")
	assert.Greater(t, health.Indicators["upgrade"].CurrentRuns, 0, "no upgrade runs")

	assert.False(t, health.LastUpdated.IsZero())
}

func TestSeededPayloadAPIs(t *testing.T) {
	var tags []models.ReleaseTag
	err := util.SippyGet("/api/releases/tags?release="+util.Release, &tags)
	require.NoError(t, err)
	require.NotEmpty(t, tags, "no seeded payload tags returned")

	phaseByStream := make(map[string]sets.Set[string])
	var rejectedCIPayload *models.ReleaseTag
	for i := range tags {
		tag := &tags[i]
		if tag.Release != util.Release {
			continue
		}
		assert.Equal(t, util.Release+".0", tag.KubernetesVersion)
		if phaseByStream[tag.Stream] == nil {
			phaseByStream[tag.Stream] = sets.New[string]()
		}
		phaseByStream[tag.Stream].Insert(tag.Phase)
		if tag.Stream == "ci" && tag.Phase == api.PayloadRejected {
			rejectedCIPayload = tag
		}
		if tag.Phase != api.PayloadRejected {
			continue
		}

		require.NotEmpty(t, tag.PreviousReleaseTag, "rejected payload %s should point to an accepted payload", tag.ReleaseTag)
		var previous *models.ReleaseTag
		for j := range tags {
			if tags[j].ReleaseTag == tag.PreviousReleaseTag {
				previous = &tags[j]
				break
			}
		}
		require.NotNil(t, previous, "previous payload %s was not returned", tag.PreviousReleaseTag)
		assert.Equal(t, tag.Release, previous.Release)
		assert.Equal(t, tag.Stream, previous.Stream)
		assert.Equal(t, api.PayloadAccepted, previous.Phase)
		assert.True(t, previous.ReleaseTime.Before(tag.ReleaseTime), "previous payload must be earlier")
	}

	for _, stream := range []string{"ci", "nightly"} {
		require.Contains(t, phaseByStream, stream)
		assert.True(t, phaseByStream[stream].Has(api.PayloadAccepted), "stream %s has no accepted payload", stream)
		assert.True(t, phaseByStream[stream].Has(api.PayloadRejected), "stream %s has no rejected payload", stream)
	}
	require.NotNil(t, rejectedCIPayload, "no rejected ci payload returned")

	var failures []*api.TestFailureAnalysis
	err = util.SippyGet("/api/payloads/test_failures?payload="+url.QueryEscape(rejectedCIPayload.ReleaseTag), &failures)
	require.NoError(t, err)
	require.NotEmpty(t, failures, "rejected payload has no test failures")

	var foundFailure *api.TestFailureAnalysis
	for _, failure := range failures {
		if failure.Name == "[sig-network] Services should serve endpoints on same port and different protocol" {
			foundFailure = failure
			break
		}
	}
	require.NotNil(t, foundFailure, "seeded service test failure was not returned for rejected payload")
	require.Contains(t, foundFailure.FailedPayloads, rejectedCIPayload.ReleaseTag)
	assert.NotEmpty(t, foundFailure.FailedPayloads[rejectedCIPayload.ReleaseTag].FailedJobs)
	assert.NotEmpty(t, foundFailure.FailedPayloads[rejectedCIPayload.ReleaseTag].FailedJobRuns)
}

func TestSeededPeriodicTestOutputAPI(t *testing.T) {
	testName := "[sig-network] Services should serve endpoints on same port and different protocol"
	var outputs []api.TestOutput
	err := util.SippyGet("/api/tests/outputs?release="+util.Release+"&test="+url.QueryEscape(testName), &outputs)
	require.NoError(t, err)
	require.NotEmpty(t, outputs, "no seeded periodic test output returned")

	foundOutput := false
	for _, output := range outputs {
		if strings.Contains(output.Output, "context deadline exceeded") {
			foundOutput = true
			assert.NotEmpty(t, output.ProwJobURL)
		}
	}
	assert.True(t, foundOutput, "expected seeded timeout output from periodic test run")
}
