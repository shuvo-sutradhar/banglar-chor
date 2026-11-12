import type { InteractionKind } from '../systems/InteractionSystem';

export type InspectableDef = {
  id: string;
  kind: InteractionKind;
  labelBn: string;
  position: [number, number, number];
  maxDistance: number;
  /** Lines cycle on repeated inspection so the joke isn't the same every time. */
  linesBn: readonly string[];
  speakerBn?: string;
};

/**
 * Phase 1 inspect targets: flavour and orientation only. They do not hint at
 * real-world entry techniques. Phase 2 will add `enter` targets at house entrances.
 */
export const INSPECTABLES: readonly InspectableDef[] = [
  {
    id: 'inspect-rahim-house',
    kind: 'inspect',
    labelBn: 'রহিম চাচার মাটির ঘর',
    position: [-9.45, 1.2, 6],
    maxDistance: 3,
    speakerBn: 'চোর',
    linesBn: [
      'ভিতর থেকে নাক ডাকার শব্দ… রহিম চাচা আজ গভীর ঘুমে।',
      'উঠানে মুরগির খোঁয়াড়। একটু শব্দ হলেই কক্‌ কক্‌!',
      'আজকে কপালে কী আছে কে জানে!',
    ],
  },
  {
    id: 'inspect-kuddus-gate',
    kind: 'inspect',
    labelBn: 'কুদ্দুস মেম্বারের বাড়ির গেট',
    position: [8.4, 1.0, -4],
    maxDistance: 3,
    speakerBn: 'চোর',
    linesBn: [
      'বাঁশের বেড়া বেশ মজবুত। মেম্বার সাহেবের পাহারাদার এদিকে টহল দেয় শুনেছি।',
      'উঠানে খড়ের গাদা — লুকানোর জায়গা হতে পারে।',
    ],
  },
  {
    id: 'inspect-morol-house',
    kind: 'inspect',
    labelBn: 'মোড়ল বাড়ির টিনের ঘর',
    position: [-8.15, 1.2, -20],
    maxDistance: 3,
    speakerBn: 'চোর',
    linesBn: [
      'টিনের চাল — একটু ঠোকাঠুকি হলেই ঝনঝন! মোড়লের কুকুরটাও কাছেই ঘুমায়।',
      'চাপকলের পাশে ভেজা মাটি। পা পিছলালে সর্বনাশ।',
    ],
  },
  {
    id: 'inspect-pond-ghat',
    kind: 'inspect',
    labelBn: 'পুকুরঘাট',
    position: [6.5, 0.6, 19],
    maxDistance: 2.6,
    speakerBn: 'চোর',
    linesBn: ['পানিতে চাঁদের আলো। সাঁতার কাটার সময় নাই, কাজ আছে!', 'ব্যাঙের ঘ্যাঁঙর ঘ্যাঁং… এরাও আজ পাহারায়?'],
  },
  {
    id: 'inspect-tea-stall',
    kind: 'inspect',
    labelBn: 'বন্ধ চায়ের দোকান',
    position: [4.0, 1.0, 9],
    maxDistance: 2.8,
    speakerBn: 'চোর',
    linesBn: ['দোকান বন্ধ। সকালে এখানে এক কাপ চা খাব — যদি ধরা না খাই।', 'বেঞ্চে কেতলিটা ফেলে গেছে মোতালেব ভাই।'],
  },
  {
    id: 'inspect-cowshed-hay',
    kind: 'inspect',
    labelBn: 'গোয়ালঘরের খড়',
    position: [-10.7, 0.5, 25.4],
    maxDistance: 2.4,
    speakerBn: 'চোর',
    linesBn: ['গরু তো নাই, খালি খড় আর মশা।', 'এখানে একটু জিরিয়ে নেওয়া যায়… না না, কাজের সময়!'],
  },
];
