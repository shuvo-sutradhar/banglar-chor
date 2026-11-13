import { mat } from '../world/materials';
import { HandLantern } from './HandLantern';
import type { Appearance } from './HumanRig';

export const THIEF_LOOK: Appearance = {
  skin: mat('skinOily'),
  lower: mat('lungi'),
  top: null,
  hair: mat('black'),
  neckGamcha: mat('gamcha'),
  headband: mat('gamchaHead'),
  cap: null,
  beard: null,
  moustache: true,
  oilable: true,
  sack: true,
};

/** মজনু মিয়া — village night patrol with a lantern and white tupi. */
export const MOJNU_LOOK: Appearance = {
  skin: mat('skinPlain'),
  lower: mat('lungiGreen'),
  top: mat('shirtKhaki'),
  hair: mat('black'),
  neckGamcha: null,
  headband: null,
  cap: mat('capWhite'),
  beard: null,
  moustache: true,
  rightHand: <HandLantern light />,
};

/** রহিম চাচা — elderly homeowner with a white beard. */
export const RAHIM_LOOK: Appearance = {
  skin: mat('skinOld'),
  lower: mat('lungiBrown'),
  top: mat('genjiWhite'),
  hair: mat('hairGrey'),
  neckGamcha: null,
  headband: null,
  cap: null,
  beard: mat('hairGrey'),
  moustache: false,
};

/** Neighbours who come running in the catch scene. */
export const NEIGHBOUR_LOOKS: Appearance[] = [
  { skin: mat('skinPlain'), lower: mat('lungiBrown'), top: mat('genjiWhite'), hair: mat('black'), neckGamcha: mat('gamcha'), headband: null, cap: null, beard: null, moustache: false },
  { skin: mat('skinOld'), lower: mat('lungi'), top: mat('shirtKhaki'), hair: mat('hairGrey'), neckGamcha: null, headband: null, cap: mat('capWhite'), beard: mat('hairGrey'), moustache: false, rightHand: <HandLantern light={false} /> },
];

// ---------------- Phase 3: the morning bazaar cast ----------------

/** হাশেম কাকা — elderly brass-and-utensils seller: white beard, tupi, cream panjabi, brown vest. */
export const HASHEM_LOOK: Appearance = {
  skin: mat('skinOld'),
  lower: mat('lungiBrown'),
  top: mat('panjabi'),
  hair: mat('hairGrey'),
  neckGamcha: null,
  headband: null,
  cap: mat('capWhite'),
  beard: mat('hairGrey'),
  moustache: false,
};

/** জলিল ভাই — young electronics trader: striped shirt, sunglasses, sharp moustache. */
export const JALIL_LOOK: Appearance = {
  skin: mat('skinPlain'),
  lower: mat('lungiGreen'),
  top: mat('shirtStripe'),
  hair: mat('black'),
  neckGamcha: null,
  headband: null,
  cap: null,
  beard: null,
  moustache: true,
  glasses: true,
};

/** বকুল আপা — general-goods seller in a saree with the anchal over her head. */
export const BOKUL_LOOK: Appearance = {
  skin: mat('skinPlain'),
  lower: mat('saree'),
  top: mat('saree'),
  hair: mat('black'),
  neckGamcha: null,
  headband: null,
  cap: null,
  beard: null,
  moustache: false,
  skirt: 1.55,
  hood: mat('sareeHood'),
};

/** হাটের পাহারাদার — the market watchman (only hunts after an alarm). */
export const WATCHMAN_LOOK: Appearance = {
  skin: mat('skinPlain'),
  lower: mat('lungiBrown'),
  top: mat('shirtKhaki'),
  hair: mat('black'),
  neckGamcha: mat('gamcha'),
  headband: null,
  cap: mat('vestBrown'),
  beard: null,
  moustache: true,
};

/** Background shoppers — low-detail rigs to keep draw calls down. */
export const SHOPPER_LOOKS: Appearance[] = [
  { skin: mat('skinPlain'), lower: mat('lungi'), top: mat('shirtBlue'), hair: mat('black'), neckGamcha: null, headband: null, cap: null, beard: null, moustache: false, lowDetail: true },
  { skin: mat('skinOld'), lower: mat('saree'), top: mat('saree'), hair: mat('black'), neckGamcha: null, headband: null, cap: null, beard: null, moustache: false, skirt: 1.55, hood: mat('sareeHood'), lowDetail: true },
  { skin: mat('skinPlain'), lower: mat('lungiGreen'), top: mat('genjiWhite'), hair: mat('black'), neckGamcha: mat('gamcha'), headband: null, cap: mat('capWhite'), beard: null, moustache: false, lowDetail: true },
  { skin: mat('skinOld'), lower: mat('lungiBrown'), top: mat('panjabi'), hair: mat('hairGrey'), neckGamcha: null, headband: null, cap: null, beard: mat('hairGrey'), moustache: false, lowDetail: true },
];
