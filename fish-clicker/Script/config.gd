class_name GameData
extends RefCounted

const RARITY_MULTIPLIER = {
	"Common": 1.0, "Uncommon": 1.4, "Rare": 1.9,
	"Legendary": 2.8, "Mythic": 3.5, "Frenzy": 2.5,
}

const AREAS = [
	{"name": "Area 1", "scoreUnlock": 0, "background": "res://Asset/Background/Background 1.png", "fish": [
		{"name": "Common Fish", "weight": 60, "value": 1},
		{"name": "Uncommon Fish", "weight": 30, "value": 3},
		{"name": "Rare Fish", "weight": 10, "value": 8},
		{"name": "Frenzy Fish", "weight": 2, "value": 5, "triggersFrenzy": true},
	]},
	{"name": "Area 2", "scoreUnlock": 200, "background": "res://Asset/Background/Background 2.png", "fish": [
		{"name": "Uncommon Fish", "weight": 50, "value": 3},
		{"name": "Rare Fish", "weight": 35, "value": 8},
		{"name": "Legendary Fish", "weight": 15, "value": 25},
		{"name": "Frenzy Fish", "weight": 2, "value": 5, "triggersFrenzy": true},
	]},
	{"name": "Area 3", "scoreUnlock": 500, "background": "res://Asset/Background/Background 3.png", "fish": [
		{"name": "Rare Fish", "weight": 45, "value": 8},
		{"name": "Legendary Fish", "weight": 40, "value": 25},
		{"name": "Mythic Fish", "weight": 15, "value": 60},
		{"name": "Frenzy Fish", "weight": 2, "value": 5, "triggersFrenzy": true},
	]},
]

static func get_rarity_multiplier(fish_name: String) -> float:
	for rarity in RARITY_MULTIPLIER:
		if fish_name.begins_with(rarity):
			return RARITY_MULTIPLIER[rarity]
	return 1.0

static func random_fish(area_index: int) -> Dictionary:
	var fish_list = AREAS[area_index]["fish"]
	var total_weight = 0
	for f in fish_list:
		total_weight += f["weight"]
	var roll = randi() % total_weight
	var cumulative = 0
	for f in fish_list:
		cumulative += f["weight"]
		if roll < cumulative:
			return f
	return fish_list[0]
