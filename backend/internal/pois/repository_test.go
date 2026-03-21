package pois

import "testing"

func TestDecodePoisIncludesImageURL(t *testing.T) {
	raw := []byte(`[
		{
			"poi_name": "Nhâm Café",
			"lat": "10.77911356",
			"lng": "106.67463359",
			"video_playcount": "953500",
			"image_url": "images/cafe.webp"
		}
	]`)

	decoded, err := decodePois(raw)
	if err != nil {
		t.Fatalf("decodePois returned error: %v", err)
	}
	if len(decoded) != 1 {
		t.Fatalf("expected 1 poi, got %d", len(decoded))
	}
	if decoded[0].ImageURL == nil {
		t.Fatalf("expected imageUrl to be populated")
	}
	if got := *decoded[0].ImageURL; got != "images/cafe.webp" {
		t.Fatalf("expected imageUrl images/cafe.webp, got %q", got)
	}
}
