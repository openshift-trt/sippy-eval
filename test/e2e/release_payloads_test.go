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

func TestReleaseTagsAPI(t *testing.T) {
	var tags []models.ReleaseTag
	err := util.SippyGet("/api/releases/tags?release="+util.Release, &tags)
	require.NoError(t, err, "error fetching release tags")
	require.Greater(t, len(tags), 0, "expected at least one release tag for %s", util.Release)

	var accepted, rejected int
	for _, tag := range tags {
		switch tag.Phase {
		case api.PayloadAccepted:
			accepted++
		case api.PayloadRejected:
			rejected++
		}
	}
	assert.Greater(t, accepted, 0, "expected at least one Accepted payload")
	assert.Greater(t, rejected, 0, "expected at least one Rejected payload")
}

func TestReleaseTagsPreviousPayloadConsistency(t *testing.T) {
	var tags []models.ReleaseTag
	err := util.SippyGet("/api/releases/tags?release="+util.Release, &tags)
	require.NoError(t, err)
	require.Greater(t, len(tags), 0)

	tagsByName := map[string]models.ReleaseTag{}
	for _, tag := range tags {
		tagsByName[tag.ReleaseTag] = tag
	}

	for _, tag := range tags {
		if tag.PreviousReleaseTag == "" {
			continue
		}
		prev, ok := tagsByName[tag.PreviousReleaseTag]
		if !ok {
			continue
		}
		assert.Equal(t, api.PayloadAccepted, prev.Phase,
			"previous payload %s for %s should be Accepted", prev.ReleaseTag, tag.ReleaseTag)
		assert.Equal(t, tag.Stream, prev.Stream,
			"previous payload %s should be in the same stream as %s", prev.ReleaseTag, tag.ReleaseTag)
		assert.Equal(t, tag.Release, prev.Release,
			"previous payload %s should be in the same release as %s", prev.ReleaseTag, tag.ReleaseTag)
		assert.True(t, prev.ReleaseTime.Before(tag.ReleaseTime),
			"previous payload %s should be earlier than %s", prev.ReleaseTag, tag.ReleaseTag)
	}
}

func TestReleaseTagsMultipleStreams(t *testing.T) {
	var tags []models.ReleaseTag
	err := util.SippyGet("/api/releases/tags?release="+util.Release, &tags)
	require.NoError(t, err)

	streams := map[string]bool{}
	for _, tag := range tags {
		streams[tag.Stream] = true
	}
	assert.GreaterOrEqual(t, len(streams), 2, "expected at least two payload streams, got %v", streams)
}

func TestReleaseTagsMultipleReleases(t *testing.T) {
	var tags421 []models.ReleaseTag
	err := util.SippyGet("/api/releases/tags?release="+util.BaseRelease, &tags421)
	require.NoError(t, err)
	assert.Greater(t, len(tags421), 0, "expected release tags for %s", util.BaseRelease)
}

func TestPeriodicTestOutputsAPI(t *testing.T) {
	testName := "[sig-network] Services should serve endpoints on same port and different protocol"
	var outputs []api.TestOutput
	err := util.SippyGet("/api/tests/outputs?release="+util.Release+"&test="+url.QueryEscape(testName), &outputs)
	require.NoError(t, err, "error fetching test outputs")
	require.Greater(t, len(outputs), 0, "expected at least one test output for periodic test failures")

	for _, output := range outputs {
		assert.NotEmpty(t, output.Output, "test output text should not be empty")
	}
}

func TestReleaseHealthReportPayloads(t *testing.T) {
	var health api.Health
	err := util.SippyGet("/api/health?release="+util.Release, &health)
	require.NoError(t, err)

	assert.Greater(t, health.Indicators["install"].CurrentRuns, 0, "no install runs")
}
