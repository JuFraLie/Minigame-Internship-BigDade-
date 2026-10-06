class_name GameUI
extends Control

signal tap_pressed
signal area_button_pressed
signal upgrade_button_pressed

@onready var progress_bar: ProgressBar = $ProgressBar
@onready var catch_label: Label = $CatchLabel
@onready var score_label: Label = $ScoreLabel
@onready var area_label: Label = $AreaLabel
@onready var area_button: Button = $AreaButton
@onready var upgrade_label: Label = $UpgradeLabel
@onready var upgrade_button: Button = $UpgradeButton
@onready var fish_button: TextureButton = $FishButton
@onready var background: Sprite2D = $Background
@onready var frenzy_label: Label = $FrenzyLabel
@onready var area_progress_label: Label = $AreaProgressLabel


func _ready() -> void:
	fish_button.pressed.connect(func(): tap_pressed.emit())
	area_button.pressed.connect(func(): area_button_pressed.emit())
	upgrade_button.pressed.connect(func(): upgrade_button_pressed.emit())
	progress_bar.max_value = 100

func set_progress(value: float, max_value: float = -1.0) -> void:
	if max_value > 0:
		progress_bar.max_value = max_value
	progress_bar.value = value
	_update_bar_color(value, progress_bar.max_value)

func _update_bar_color(value: float, max_value: float) -> void:
	var pct = value / max_value * 100.0
	var fill_style = progress_bar.get_theme_stylebox("fill") as StyleBoxFlat
	if fill_style:
		if pct < 30: fill_style.bg_color = Color.RED
		elif pct < 60: fill_style.bg_color = Color.ORANGE
		else: fill_style.bg_color = Color.GREEN

func show_catch(fish: Dictionary, earned: int) -> void:
	catch_label.text = "%s (+%d)" % [fish["name"], earned]
	catch_label.modulate = _rarity_color(fish["name"])
	catch_label.scale = Vector2(1.3, 1.3)
	create_tween().tween_property(catch_label, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK)

func show_message(text: String) -> void:
	catch_label.text = text

func update_score(score: int) -> void:
	score_label.text = "Score: %d" % score

func update_combo(combo_count: int, combo_target: int, frenzy_active: bool, frenzy_time_left: float) -> void:
	if frenzy_active:
		frenzy_label.text = "FRENZY %ds" % ceil(frenzy_time_left)
	else:
		frenzy_label.text = "Combo: %d/%d" % [combo_count, combo_target]

func update_area_progress(current_score: int, next_unlock: int, has_next: bool) -> void:
	if has_next:
		area_progress_label.text = "Next area: %d more" % (next_unlock - current_score)
	else:
		area_progress_label.text = "Final area reached"

func update_area(area_name: String, background_path: String) -> void:
	area_label.text = area_name
	background.texture = load(background_path)

func update_upgrade(level: int, cost: int) -> void:
	upgrade_label.text = "Pancing (Lv %d) - Need: %d" % [level + 1, cost]

func _rarity_color(fish_name: String) -> Color:
	if fish_name.begins_with("Frenzy"): return Color.CYAN
	elif fish_name.begins_with("Legendary") or fish_name.begins_with("Mythic"): return Color.GOLD
	elif fish_name.begins_with("Rare"): return Color.MEDIUM_PURPLE
	elif fish_name.begins_with("Uncommon"): return Color.LIGHT_GREEN
	return Color.WHITE
	
