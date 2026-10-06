class_name ScoreSystem
extends Node

signal score_changed(score: int)
signal combo_changed(count: int, target: int)
signal frenzy_started(duration: float)
signal frenzy_ended
signal catch_registered(fish: Dictionary, earned: int)

var score: int = 0
var combo_count: int = 0
var combo_target: int = 5
var frenzy_active: bool = false
var frenzy_time_left: float = 0.0
var frenzy_duration: float = 20.0
var frenzy_score_multiplier: float = 2.0

func register_catch(fish: Dictionary, hit_zero: bool) -> void:
	var earned = fish.get("value", 0)
	if frenzy_active:
		earned = int(earned * frenzy_score_multiplier)
	score += earned
	score_changed.emit(score)
	catch_registered.emit(fish, earned)

	if fish.get("triggersFrenzy", false):
		_start_frenzy()
	elif not frenzy_active:
		if hit_zero:
			combo_count = 0
		else:
			combo_count += 1
			if combo_count >= combo_target:
				_start_frenzy()
		combo_changed.emit(combo_count, combo_target)

func _start_frenzy() -> void:
	frenzy_active = true
	frenzy_time_left = frenzy_duration
	combo_count = 0
	frenzy_started.emit(frenzy_duration)

func _process(delta: float) -> void:
	if frenzy_active:
		frenzy_time_left -= delta
		if frenzy_time_left <= 0.0:
			frenzy_active = false
			frenzy_ended.emit()
