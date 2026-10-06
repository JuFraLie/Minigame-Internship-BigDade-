class_name FishingSystem
extends Node

signal waiting_started
signal bite_started(fish: Dictionary, max_progress: float)
signal progress_changed(value: float)
signal fish_caught(fish: Dictionary, hit_zero: bool)

enum Status { WAITING, BITING }

var status: Status = Status.WAITING
var continuous_biting: bool = false
var tap_strength: float = 8.0
var decay_speed: float = 15.0

var _bite_timer: float = 0.0
var _next_bite_time: float = 0.0
var _progress: float = 0.0
var _max_progress: float = 100.0
var _has_tapped: bool = false
var _hit_zero_this_bite: bool = false
var _current_fish: Dictionary = {}
var _area_index: int = 0

func set_area(area_index: int) -> void:
	_area_index = area_index

func start_waiting() -> void:
	status = Status.WAITING
	_bite_timer = 0.0
	_next_bite_time = randf_range(1.5, 4.0)
	_progress = 0.0
	waiting_started.emit()

func start_biting() -> void:
	status = Status.BITING
	_hit_zero_this_bite = false
	_has_tapped = false
	_current_fish = GameData.random_fish(_area_index)
	_max_progress = 100.0 * GameData.get_rarity_multiplier(_current_fish["name"])
	_progress = 0.0
	bite_started.emit(_current_fish, _max_progress)

func tap() -> void:
	if status != Status.BITING:
		return
	_progress += tap_strength
	_has_tapped = true
	progress_changed.emit(_progress)
	if _progress >= _max_progress:
		fish_caught.emit(_current_fish, _hit_zero_this_bite)
		if continuous_biting:
			start_biting()
		else:
			start_waiting()

func increase_tap_strength(amount: float) -> void:
	tap_strength += amount

func _process(delta: float) -> void:
	if status == Status.WAITING:
		_bite_timer += delta
		if _bite_timer >= _next_bite_time:
			start_biting()
	elif status == Status.BITING:
		_progress = max(0.0, _progress - decay_speed * delta)
		if _progress <= 0.0 and _has_tapped:
			_hit_zero_this_bite = true
		progress_changed.emit(_progress)
