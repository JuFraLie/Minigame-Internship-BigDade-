class_name AreaSystem
extends Node

signal area_changed(area_index: int, area_data: Dictionary)
signal unlock_denied(missing_score: int, area_name: String)

var current_area: int = 0

func try_advance(score: int) -> void:
	var next_index = (current_area + 1) % GameData.AREAS.size()
	if score >= GameData.AREAS[next_index]["scoreUnlock"]:
		current_area = next_index
		area_changed.emit(current_area, GameData.AREAS[current_area])
	else:
		var missing = GameData.AREAS[next_index]["scoreUnlock"] - score
		unlock_denied.emit(missing, GameData.AREAS[next_index]["name"])
