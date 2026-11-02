package e2e

import (
	"net/url"
	"testing"

	apitype "github.com/openshift/sippy/pkg/apis/api"
	"github.com/openshift/sippy/test/e2e/util"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPeriodicTestOutputsAPI(t *testing.T) {
	// Query test outputs for a test known to have failures with output text
	// in the 4.22 periodic seed data.
	testName := "[sig-etcd] etcd leader changes are not excessive"
	var outputs []apitype.TestOutput
	err := util.SippyGet("/api/tests/outputs?release="+util.Release+"&test="+url.QueryEscape(testName), &outputs)
	require.NoError(t, err, "error fetching test outputs")
	require.Greater(t, len(outputs), 0, "expected at least one test output for %s", testName)

	for _, o := range outputs {
		assert.NotEmpty(t, o.Output, "output text should not be empty")
	}
}
