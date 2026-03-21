package routes

import (
	"testing"

	"vibemap/backend/internal/api"
)

func TestPickStopsKnapsackPrefersHigherPlaycountValue(t *testing.T) {
	origin := api.LatLng{Lat: 10.7700, Lng: 106.7000}
	dest := api.LatLng{Lat: 10.7800, Lng: 106.7100}

	lowNear := api.Poi{
		ID:             "low_near",
		Name:           "Low Near",
		Location:       api.LatLng{Lat: 10.7750, Lng: 106.7050},
		VideoPlaycount: int64Ptr(100),
	}
	highFar := api.Poi{
		ID:             "high_far",
		Name:           "High Far",
		Location:       api.LatLng{Lat: 10.8035, Lng: 106.7000},
		VideoPlaycount: int64Ptr(10000),
	}

	stops := pickStopsKnapsack(
		[]api.Poi{lowNear, highFar},
		origin,
		dest,
		48,
		api.TransportModeBike,
		18,
		1,
		true,
	)

	if len(stops) != 1 {
		t.Fatalf("expected exactly one stop, got %d", len(stops))
	}
	if stops[0].ID != highFar.ID {
		t.Fatalf("expected highest playcount POI to be selected, got %s", stops[0].ID)
	}
}

func TestPickStopsKnapsackSortsByRouteProgress(t *testing.T) {
	origin := api.LatLng{Lat: 10.7700, Lng: 106.7000}
	dest := api.LatLng{Lat: 10.7900, Lng: 106.7200}

	first := api.Poi{
		ID:             "first",
		Name:           "First",
		Location:       api.LatLng{Lat: 10.7750, Lng: 106.7050},
		VideoPlaycount: int64Ptr(500000),
	}
	second := api.Poi{
		ID:             "second",
		Name:           "Second",
		Location:       api.LatLng{Lat: 10.7850, Lng: 106.7150},
		VideoPlaycount: int64Ptr(480000),
	}

	stops := pickStopsKnapsack(
		[]api.Poi{second, first},
		origin,
		dest,
		120,
		api.TransportModeBike,
		18,
		2,
		true,
	)

	if len(stops) < 2 {
		t.Fatalf("expected at least two stops, got %d", len(stops))
	}
	if stops[0].ID != first.ID || stops[1].ID != second.ID {
		t.Fatalf("expected stops ordered by route progress, got %s then %s", stops[0].ID, stops[1].ID)
	}
}

func int64Ptr(v int64) *int64 {
	return &v
}

func TestTargetStopsForBudget(t *testing.T) {
	cases := []struct {
		budget int
		want   int
	}{
		{budget: 120, want: 1},
		{budget: 180, want: 1},
		{budget: 240, want: 2},
		{budget: 300, want: 2},
		{budget: 360, want: 3},
		{budget: 480, want: 3},
	}
	for _, tc := range cases {
		got := targetStopsForBudget(tc.budget)
		if got != tc.want {
			t.Fatalf("budget=%d want=%d got=%d", tc.budget, tc.want, got)
		}
	}
}
