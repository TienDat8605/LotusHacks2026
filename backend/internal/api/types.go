package api

type LatLng struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type TransportMode string

const (
	TransportModeBike TransportMode = "bike"
	TransportModeCar  TransportMode = "car"
	TransportModeWalk TransportMode = "walk"
	TransportModeBus  TransportMode = "bus"
)

type Poi struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Location LatLng   `json:"location"`
	Address  *string  `json:"address,omitempty"`
	City     *string  `json:"city,omitempty"`
	VideoURL *string  `json:"videoUrl,omitempty"`
	VideoID  *string  `json:"videoId,omitempty"`
	Category *string  `json:"category,omitempty"`
	Rating   *float64 `json:"rating,omitempty"`
	Badges   []string `json:"badges,omitempty"`
}

type RoutePlanRequest struct {
	Origin            string        `json:"origin"`
	Destination       string        `json:"destination"`
	TimeBudgetMinutes int           `json:"timeBudgetMinutes"`
	TransportMode     TransportMode `json:"transportMode"`
	IncludeTrending   bool          `json:"includeTrending"`
}

type RouteStep struct {
	Instruction     string `json:"instruction"`
	DistanceMeters  *int   `json:"distanceMeters,omitempty"`
	DurationMinutes *int   `json:"durationMinutes,omitempty"`
}

type RouteLeg struct {
	FromPoiID       *string     `json:"fromPoiId,omitempty"`
	ToPoiID         *string     `json:"toPoiId,omitempty"`
	DurationMinutes int         `json:"durationMinutes"`
	Path            []LatLng    `json:"path,omitempty"`
	Steps           []RouteStep `json:"steps"`
}

type RoutePlan struct {
	ID                   string      `json:"id"`
	Title                string      `json:"title"`
	Origin               *NamedPoint `json:"origin,omitempty"`
	Destination          *NamedPoint `json:"destination,omitempty"`
	Pois                 []Poi       `json:"pois"`
	Legs                 []RouteLeg  `json:"legs"`
	TotalDurationMinutes int         `json:"totalDurationMinutes"`
}

type NamedPoint struct {
	Name     *string `json:"name,omitempty"`
	Location LatLng  `json:"location"`
}

type ChatMessage struct {
	ID        string `json:"id"`
	Role      string `json:"role"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
}

type SocialSession struct {
	ID               string `json:"id"`
	DestinationName  string `json:"destinationName"`
	ParticipantCount int    `json:"participantCount"`
	Status           string `json:"status"`
}

type SocialParticipant struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"displayName"`
	AvatarSeed  string   `json:"avatarSeed"`
	Lat         *float64 `json:"lat,omitempty"`
	Lng         *float64 `json:"lng,omitempty"`
	LastSeen    string   `json:"lastSeen"`
}
