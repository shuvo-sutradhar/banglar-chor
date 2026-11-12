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
