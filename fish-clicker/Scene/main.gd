extends Node2D

@onready var progressBar: ProgressBar = $UI/ProgressBar
@onready var catchLabel: Label = $UI/CatchLabel
@onready var scoreLabel: Label = $UI/ScoreLabel
@onready var areaLabel: Label = $UI/AreaLabel
@onready var areaButton: Button = $UI/AreaButton
@onready var upgradeLabel: Label = $UI/UpgradeLabel
@onready var upgradeButton: Button = $UI/UpgradeButton
@onready var fishButton: TextureButton = $UI/FishButton
@onready var biteIndicator: Label = $Sprite2D/BiteIndicator

enum Status { WAITING, BITING }
var currentStatus: Status = Status.WAITING
var biteTimer: float = 0.0
var nextBiteTime: float = 0.0
var progress: float = 0.0
var decaySpeed: float = 15.0
var tapStrength: float = 8.0
var score: int = 0
var upgradeLevel: int = 0
var baseUpgradeCost: int = 30
var upgradeCostGrowth: float = 1.6
var biteMode: bool = true # false = frenzy mode
var comboCount: int = 0
var comboTarget: int = 5
var hitZeroThisBite: bool = false
var hasTapped: bool = false
var frenzyActive: bool = false
var frenzyTimeLeft: float = 0.0
var frenzyDuration: float = 20.0
var frenzyScoreMultiplier: float = 2.0

var areaList = [
	{"name": "Area 1", "scoreUnlock": 0, "fish": [
		{"name": "Common Fish", "weight": 60, "value": 1},
		{"name": "Uncommon Fish", "weight": 30, "value": 3},
		{"name": "Rare Fish", "weight": 10, "value": 8},
		{"name": "Frenzy Fish", "weight": 2, "value": 5, "triggersFrenzy": true},
	]},
	{"name": "Area 2", "scoreUnlock": 200, "fish": [
		{"name": "Uncommon Fish", "weight": 50, "value": 3},
		{"name": "Rare Fish", "weight": 35, "value": 8},
		{"name": "Legendary Fish", "weight": 15, "value": 25},
		{"name": "Frenzy Fish", "weight": 2, "value": 5, "triggersFrenzy": true},
	]},
	{"name": "Area 3", "scoreUnlock": 500, "fish": [
		{"name": "Rare Fish", "weight": 45, "value": 8},
		{"name": "Legendary Fish", "weight": 40, "value": 25},
		{"name": "Mythic Fish", "weight": 15, "value": 60},
		{"name": "Frenzy Fish", "weight": 2, "value": 5, "triggersFrenzy": true},
	]},
]

var currentFish: Dictionary = {}

var rarityMultiplier = {
	"Common": 1.0,
	"Uncommon": 1.4,
	"Rare": 1.9,
	"Legendary": 2.8,
	"Mythic": 3.5,
	"Frenzy": 2.5,
}

var currentArea: int = 0

func _ready():
	fishButton.pressed.connect(_onTap)
	areaButton.pressed.connect(_onAreaChange)
	upgradeButton.pressed.connect(_onUpgrade)
	progressBar.max_value = 100
	_updateAreaLabel()
	_updateUpgradeLabel()
	if biteMode:
		_startWaiting()
	else:
		_startBiting()

func _process(delta):
	match currentStatus:
		Status.WAITING:
			biteTimer += delta
			if biteTimer >= nextBiteTime:
				_startBiting()
		Status.BITING:
			progress = max(0.0, progress - decaySpeed * delta)
			if progress <= 0.0 and hasTapped:
				hitZeroThisBite = true
			progressBar.value = progress
			_updateBarColor()

	if frenzyActive:
		frenzyTimeLeft -= delta
		if frenzyTimeLeft <= 0.0:
			_endFrenzy()

func _startWaiting():
	currentStatus = Status.WAITING
	biteTimer = 0.0
	nextBiteTime = randf_range(1.5, 4.0)
	biteIndicator.visible = false
	progress = 0.0
	progressBar.value = 0

func _startBiting():
	currentStatus = Status.BITING
	biteIndicator.visible = biteMode or frenzyActive
	hitZeroThisBite = false
	hasTapped = false
	currentFish = _randomFish()
	var multiplier = _getRarityMultiplier(currentFish["name"])
	progressBar.max_value = 100 * multiplier
	progress = 0.0

func _getRarityMultiplier(fishName: String) -> float:
	for rarity in rarityMultiplier:
		if fishName.begins_with(rarity):
			return rarityMultiplier[rarity]
	return 1.0

func _onTap():
	if currentStatus != Status.BITING:
		return

	progress += tapStrength
	hasTapped = true
	if progress >= progressBar.max_value:
		_catchFish()
		if frenzyActive or not biteMode:
			_startBiting()
		else:
			_startWaiting()

func _updateBarColor():
	var fillStyle = progressBar.get_theme_stylebox("fill") as StyleBoxFlat
	if fillStyle:
		if progress < 30:
			fillStyle.bg_color = Color.RED
		elif progress < 60:
			fillStyle.bg_color = Color.ORANGE
		else:
			fillStyle.bg_color = Color.GREEN

func _catchFish():
	var fish = currentFish
	var earned = fish.get("value", 0)
	if frenzyActive:
		earned = int(earned * frenzyScoreMultiplier)
	score += earned
	catchLabel.text = fish["name"] + " (+%d)" % earned
	catchLabel.modulate = _rarityColor(fish["name"])
	_animateCatchLabelPop()

	if fish.get("triggersFrenzy", false):
		_startFrenzy()
	elif not frenzyActive:
		if hitZeroThisBite:
			comboCount = 0
		else:
			comboCount += 1
			if comboCount >= comboTarget:
				_startFrenzy()

	_updateAreaLabel()

func _rarityColor(fishName: String) -> Color:
	if fishName.begins_with("Frenzy"):
		return Color.CYAN
	elif fishName.begins_with("Legendary") or fishName.begins_with("Mythic"):
		return Color.GOLD
	elif fishName.begins_with("Rare"):
		return Color.MEDIUM_PURPLE
	elif fishName.begins_with("Uncommon"):
		return Color.LIGHT_GREEN
	else:
		return Color.WHITE

func _animateCatchLabelPop():
	catchLabel.scale = Vector2(1.3, 1.3)
	var tween = create_tween()
	tween.tween_property(catchLabel, "scale", Vector2(1.0, 1.0), 0.25).set_trans(Tween.TRANS_BACK)

func _randomFish() -> Dictionary:
	var fishListForArea = areaList[currentArea]["fish"]
	var totalWeight = 0
	for f in fishListForArea:
		totalWeight += f["weight"]
	var roll = randi() % totalWeight
	var cumulative = 0
	for f in fishListForArea:
		cumulative += f["weight"]
		if roll < cumulative:
			return f
	return fishListForArea[0]

func _onAreaChange():
	var nextIndex = currentArea + 1
	if nextIndex >= areaList.size():
		nextIndex = 0

	if score >= areaList[nextIndex]["scoreUnlock"]:
		currentArea = nextIndex
		_updateAreaLabel()
	else:
		var missing = areaList[nextIndex]["scoreUnlock"] - score
		catchLabel.text = "Need %d more score to reach %s" % [missing, areaList[nextIndex]["name"]]

func _updateAreaLabel():
	areaLabel.text = areaList[currentArea]["name"]

	var nextIndex = currentArea + 1
	var baseText = ""
	if nextIndex < areaList.size():
		baseText = "Score: %d (next: %d)" % [score, areaList[nextIndex]["scoreUnlock"]]
	else:
		baseText = "Score: %d (last area)" % score

	if frenzyActive:
		scoreLabel.text = baseText + "  |  FRENZY %ds" % ceil(frenzyTimeLeft)
	else:
		scoreLabel.text = baseText + "  |  Combo: %d/%d" % [comboCount, comboTarget]

func _onUpgrade():
	var cost = _upgradeCost()
	if score >= cost:
		upgradeLevel += 1
		tapStrength += 2.0
		_updateUpgradeLabel()
		_updateAreaLabel()
	else:
		catchLabel.text = "Need %d total score to upgrade" % cost

func _upgradeCost() -> int:
	return int(baseUpgradeCost * pow(upgradeCostGrowth, upgradeLevel))

func _updateUpgradeLabel():
	upgradeLabel.text = "Fishing Rod Upgrade (Lv %d) - Requires: %d" % [upgradeLevel + 1, _upgradeCost()]

func _onBiteToggle(pressed: bool):
	biteMode = pressed

func _startFrenzy():
	frenzyActive = true
	frenzyTimeLeft = frenzyDuration
	comboCount = 0

func _endFrenzy():
	frenzyActive = false
	_updateAreaLabel()
