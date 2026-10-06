class_name UpgradeSystem
extends Node

signal upgraded(level: int, tap_strength_gain: float)
signal upgrade_denied(cost: int)

var level: int = 0
var base_cost: int = 30
var cost_growth: float = 1.6
var tap_strength_gain: float = 2.0

func cost() -> int:
	return int(base_cost * pow(cost_growth, level))

func try_upgrade(score: int) -> void:
	if score >= cost():
		level += 1
		upgraded.emit(level, tap_strength_gain)
	else:
		upgrade_denied.emit(cost())
