package models

type SectorConfig struct {
	Sector      string        `json:"sector" yaml:"sector"`
	DisplayName string        `json:"display_name" yaml:"display_name"`
	Ratios      []RatioConfig `json:"ratios" yaml:"ratios"`
	EdgeCases   EdgeCases     `json:"edge_cases" yaml:"edge_cases"`
	RatingScale RatingScale   `json:"rating_scale" yaml:"rating_scale"`
}

type RatioConfig struct {
	Key           string   `json:"key" yaml:"key"`
	Name          string   `json:"name" yaml:"name"`
	Weight        float64  `json:"weight" yaml:"weight"`
	LowerIsBetter bool     `json:"lower_is_better" yaml:"lower_is_better"`
	Ranges        RangeSet `json:"ranges" yaml:"ranges"`
	MinClamp      *float64 `json:"min_clamp,omitempty" yaml:"min_clamp,omitempty"`
	MaxClamp      *float64 `json:"max_clamp,omitempty" yaml:"max_clamp,omitempty"`
}

type RangeSet struct {
	Strong Range `json:"strong" yaml:"strong"`
	Good   Range `json:"good" yaml:"good"`
	Neutral Range `json:"neutral" yaml:"neutral"`
	Weak   Range `json:"weak" yaml:"weak"`
	Poor   Range `json:"poor" yaml:"poor"`
}

type Range struct {
	Min *float64 `json:"min,omitempty" yaml:"min,omitempty"`
	Max *float64 `json:"max,omitempty" yaml:"max,omitempty"`
}

type EdgeCases struct {
	NegativeEarnings     string  `json:"negative_earnings" yaml:"negative_earnings"`
	MissingDataThreshold float64 `json:"missing_data_threshold" yaml:"missing_data_threshold"`
}

type RatingScale struct {
	StrongBuy  Range `json:"strong_buy" yaml:"strong_buy"`
	Buy        Range `json:"buy" yaml:"buy"`
	Hold       Range `json:"hold" yaml:"hold"`
	Sell       Range `json:"sell" yaml:"sell"`
	StrongSell Range `json:"strong_sell" yaml:"strong_sell"`
}
