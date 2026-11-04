package e2e

import (
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openshift/sippy/pkg/apis/api"
	"github.com/openshift/sippy/pkg/db/models"
	"github.com/openshift/sippy/test/e2e/util"
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

func TestSeededPayloadAndPeriodicTestOutput(t *testing.T) {
	var tags []models.ReleaseTag
	err := util.SippyGet("/api/releases/tags", &tags)
	require.NoError(t, err)
	require.NotEmpty(t, tags, "expected seeded release payload tags")

	tagsByName := make(map[string]models.ReleaseTag, len(tags))
	streams := map[string]bool{}
	phases := map[string]bool{}
	releases := map[string]bool{}
	for _, tag := range tags {
		tagsByName[tag.ReleaseTag] = tag
		streams[tag.Stream] = true
		phases[tag.Phase] = true
		releases[tag.Release] = true
	}
	assert.True(t, releases["4.21"])
	assert.True(t, releases["4.22"])
	assert.True(t, streams["nightly"])
	assert.True(t, streams["ci"])
	assert.True(t, phases["Accepted"])
	assert.True(t, phases["Rejected"])
	for _, tag := range tags {
		if tag.PreviousReleaseTag == "" {
			continue
		}
		previous, ok := tagsByName[tag.PreviousReleaseTag]
		require.True(t, ok, "previous payload %q should be listed", tag.PreviousReleaseTag)
		assert.Equal(t, tag.Release, previous.Release)
		assert.Equal(t, tag.Stream, previous.Stream)
		assert.Equal(t, "Accepted", previous.Phase)
		assert.True(t, previous.ReleaseTime.Before(tag.ReleaseTime))
	}

	var payloadRuns []models.ReleaseJobRun
	err = util.SippyGet("/api/releases/job_runs?release="+util.Release, &payloadRuns)
	require.NoError(t, err)
	require.NotEmpty(t, payloadRuns, "expected job runs linked to seeded payloads")
	var payloadPullRequests []models.ReleasePullRequest
	err = util.SippyGet("/api/releases/pull_requests?release="+util.Release, &payloadPullRequests)
	require.NoError(t, err)
	require.NotEmpty(t, payloadPullRequests, "expected pull requests linked to seeded payloads")
	assert.Equal(t, "2824", payloadPullRequests[0].PullRequestID)

	outputPath := "/api/tests/outputs?release=" + util.Release + "&test=" + url.QueryEscape("[sig-network] Services should serve endpoints on same port and different protocol")
	var outputs []api.TestOutput
	err = util.SippyGet(outputPath, &outputs)
	require.NoError(t, err)
	require.NotEmpty(t, outputs, "expected failed periodic test output from the seed")
	assert.Contains(t, outputs[0].Output, "Synthetic periodic failure")
	assert.NotEmpty(t, outputs[0].ProwJobURL)
}
