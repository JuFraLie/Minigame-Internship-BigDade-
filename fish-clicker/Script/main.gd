extends Node2D

@onready var ui: GameUI = $UI
@onready var bite_indicator: Label = $Sprite2D/BiteIndicator
@onready var fishing: FishingSystem = $FishManager/FishingSystem
@onready var scoring: ScoreSystem = $FishManager/ScoreSystem
@onready var areas: AreaSystem = $FishManager/AreaSystem
@onready var upgrades: UpgradeSystem = $FishManager/UpgradeSystem

var bite_mode: bool = true

func _ready() -> void:
	fishing.set_area(areas.current_area)
	fishing.continuous_biting = not bite_mode

	fishing.waiting_started.connect(_on_waiting_started)
	fishing.bite_started.connect(_on_bite_started)
	fishing.progress_changed.connect(ui.set_progress)
	fishing.fish_caught.connect(_on_fish_caught)

	scoring.catch_registered.connect(ui.show_catch)
	scoring.score_changed.connect(func(_s): _refresh_score_label())
	scoring.combo_changed.connect(func(_c, _t): _refresh_score_label())
	scoring.frenzy_started.connect(_on_frenzy_started)
	scoring.frenzy_ended.connect(_on_frenzy_ended)

	areas.area_changed.connect(_on_area_changed)
	areas.unlock_denied.connect(func(missing, area_name): ui.show_message("Need %d more score to reach %s" % [missing, area_name]))

	upgrades.upgraded.connect(_on_upgraded)
	upgrades.upgrade_denied.connect(func(cost): ui.show_message("Need %d total score to upgrade" % cost))

	ui.tap_pressed.connect(fishing.tap)
	ui.area_button_pressed.connect(func(): areas.try_advance(scoring.score))
	ui.upgrade_button_pressed.connect(func(): upgrades.try_upgrade(scoring.score))

	ui.update_area(GameData.AREAS[areas.current_area]["name"], GameData.AREAS[areas.current_area]["background"])
	ui.update_upgrade(upgrades.level, upgrades.cost())
	_refresh_score_label()

	if bite_mode: fishing.start_waiting()
	else: fishing.start_biting()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("tap"):
		fishing.tap()

func _on_waiting_started() -> void:
	bite_indicator.visible = false
	ui.set_progress(0, 100)

func _on_bite_started(_fish: Dictionary, max_progress: float) -> void:
	bite_indicator.visible = bite_mode or scoring.frenzy_active
	ui.set_progress(0, max_progress)

func _on_fish_caught(fish: Dictionary, hit_zero: bool) -> void:
	scoring.register_catch(fish, hit_zero)

func _on_frenzy_started(_duration: float) -> void:
	fishing.continuous_biting = true
	_refresh_score_label()

func _on_frenzy_ended() -> void:
	fishing.continuous_biting = not bite_mode
	_refresh_score_label()

func _on_area_changed(area_index: int, area_data: Dictionary) -> void:
	fishing.set_area(area_index)
	ui.update_area(area_data["name"], area_data["background"])
	_refresh_score_label()

func _on_upgraded(level: int, gain: float) -> void:
	fishing.increase_tap_strength(gain)
	ui.update_upgrade(level, upgrades.cost())

func _refresh_score_label() -> void:
	var next_index = areas.current_area + 1
	var has_next = next_index < GameData.AREAS.size()
	var next_unlock = GameData.AREAS[next_index]["scoreUnlock"] if has_next else 0

	ui.update_score(scoring.score)
	ui.update_combo(scoring.combo_count, scoring.combo_target, scoring.frenzy_active, scoring.frenzy_time_left)
	ui.update_area_progress(scoring.score, next_unlock, has_next)
