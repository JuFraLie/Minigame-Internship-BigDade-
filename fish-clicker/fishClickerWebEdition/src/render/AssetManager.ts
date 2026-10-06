export const images = {
  bg1: new Image(),
  bg2: new Image(),
  bg3: new Image(),
  glass: new Image(),
  fisherman: new Image(),
  button: new Image(),
  smallFish: new Image(),
  medFish: new Image(),
  bigFish: new Image(),
};

export function loadAssets(): void {
  images.bg1.src = 'Asset/Background/Background 1.jpg';
  images.bg2.src = 'Asset/Background/Background 2.png';
  images.bg3.src = 'Asset/Background/Background 3.png';
  images.glass.src = 'Asset/Background/Glass.png';
  images.fisherman.src = 'Asset/Player/Fisherman.png';
  images.button.src = 'Asset/UI/button.png';
  images.smallFish.src = 'Asset/Fish/smallFish.png';
  images.medFish.src = 'Asset/Fish/medFish.png';
  images.bigFish.src = 'Asset/Fish/bigFish.png';
}

export function getFishImage(name: string): HTMLImageElement {
  if (name.includes("Common")) return images.smallFish;
  if (name.includes("Uncommon") || name.includes("Rare")) return images.medFish;
  if (name.includes("Legendary") || name.includes("Mythic") || name.includes("Frenzy")) return images.bigFish;
  return images.smallFish;
}
