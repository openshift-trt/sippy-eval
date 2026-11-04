package main

import (
	"testing"

	"github.com/openshift/sippy/pkg/db/models"
	"github.com/stretchr/testify/require"
)

func TestRegressionSyncClosesOnlyWhenNoEnabledViewReportsRegression(t *testing.T) {
	shared := &models.TestRegression{ID: 1}
	mainOnly := &models.TestRegression{ID: 2}
	rolledOff := &models.TestRegression{ID: 3}

	activeIDs := activeRegressionIDs(
		[]*models.TestRegression{shared, mainOnly},
		[]*models.TestRegression{shared},
	)
	toClose := regressionsToClose(activeIDs, []*models.TestRegression{shared, mainOnly, rolledOff})

	require.Len(t, toClose, 1)
	require.Equal(t, rolledOff.ID, toClose[0].ID)
}
