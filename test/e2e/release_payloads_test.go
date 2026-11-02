package e2e

import (
	"net/url"
	"testing"

	"github.com/openshift/sippy/test/e2e/util"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReleaseTagsAPI(t *testing.T) {
	type releaseTagResponse struct {
		ReleaseTag         string   `json:"release_tag"`
		Release            string   `json:"release"`
		Stream             string   `json:"stream"`
		Phase              string   `json:"phase"`
		PreviousReleaseTag string   `json:"previous_release_tag"`
		FailedJobNames     []string `json:"failed_job_names,omitempty"`
	}

	var tags []releaseTagResponse
	err := util.SippyGet("/api/releases/tags?release="+util.Release, &tags)
	require.NoError(t, err, "error fetching release tags")
	require.Greater(t, len(tags), 0, "no release tags returned for release %s", util.Release)

	t.Run("contains both Accepted and Rejected payloads", func(t *testing.T) {
		phases := map[string]int{}
		for _, tag := range tags {
			phases[tag.Phase]++
		}
		assert.Greater(t, phases["Accepted"], 0, "expected at least one Accepted payload")
		assert.Greater(t, phases["Rejected"], 0, "expected at least one Rejected payload")
	})

	t.Run("previous release tag references an earlier Accepted payload", func(t *testing.T) {
		acceptedTags := map[string]bool{}
		for _, tag := range tags {
			if tag.Phase == "Accepted" {
				acceptedTags[tag.ReleaseTag] = true
			}
		}

		for _, tag := range tags {
			if tag.PreviousReleaseTag != "" {
				assert.True(t, acceptedTags[tag.PreviousReleaseTag],
					"previous_release_tag %q for %q should be an Accepted payload",
					tag.PreviousReleaseTag, tag.ReleaseTag)
			}
		}
	})
}

func TestReleaseTagsMultipleReleases(t *testing.T) {
	type releaseTagResponse struct {
		ReleaseTag string `json:"release_tag"`
		Release    string `json:"release"`
	}

	var tags422 []releaseTagResponse
	err := util.SippyGet("/api/releases/tags?release="+util.Release, &tags422)
	require.NoError(t, err, "error fetching release tags for %s", util.Release)

	var tags421 []releaseTagResponse
	err = util.SippyGet("/api/releases/tags?release="+util.BaseRelease, &tags421)
	require.NoError(t, err, "error fetching release tags for %s", util.BaseRelease)

	assert.Greater(t, len(tags422), 0, "expected release tags for %s", util.Release)
	assert.Greater(t, len(tags421), 0, "expected release tags for %s", util.BaseRelease)
}

func TestReleaseTagJobRuns(t *testing.T) {
	type releaseTagResponse struct {
		ReleaseTag string `json:"release_tag"`
		Phase      string `json:"phase"`
	}

	var tags []releaseTagResponse
	err := util.SippyGet("/api/releases/tags?release="+util.Release, &tags)
	require.NoError(t, err, "error fetching release tags")
	require.Greater(t, len(tags), 0, "no release tags returned")

	var payload string
	for _, tag := range tags {
		if tag.Phase == "Accepted" {
			payload = tag.ReleaseTag
			break
		}
	}
	require.NotEmpty(t, payload, "no Accepted payload found")

	filterJSON := url.QueryEscape(`{"items":[{"columnField":"release_tag","operatorValue":"equals","value":"` + payload + `"}]}`)
	var events []map[string]interface{}
	err = util.SippyGet("/api/releases/tags/events?release="+util.Release+"&filter="+filterJSON, &events)
	require.NoError(t, err, "error fetching release tag events")
}
