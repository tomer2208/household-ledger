import type { ComponentType } from 'react';
import { AirplaneIcon } from 'phosphor-react-native/src/icons/Airplane';
import { BabyIcon } from 'phosphor-react-native/src/icons/Baby';
import { BackpackIcon } from 'phosphor-react-native/src/icons/Backpack';
import { BankIcon } from 'phosphor-react-native/src/icons/Bank';
import { BarbellIcon } from 'phosphor-react-native/src/icons/Barbell';
import { BedIcon } from 'phosphor-react-native/src/icons/Bed';
import { BookOpenIcon } from 'phosphor-react-native/src/icons/BookOpen';
import { BriefcaseIcon } from 'phosphor-react-native/src/icons/Briefcase';
import { BuildingsIcon } from 'phosphor-react-native/src/icons/Buildings';
import { BusIcon } from 'phosphor-react-native/src/icons/Bus';
import { CarIcon } from 'phosphor-react-native/src/icons/Car';
import { CoffeeIcon } from 'phosphor-react-native/src/icons/Coffee';
import { ConfettiIcon } from 'phosphor-react-native/src/icons/Confetti';
import { CouchIcon } from 'phosphor-react-native/src/icons/Couch';
import { CreditCardIcon } from 'phosphor-react-native/src/icons/CreditCard';
import { DeviceMobileIcon } from 'phosphor-react-native/src/icons/DeviceMobile';
import { DotsThreeIcon } from 'phosphor-react-native/src/icons/DotsThree';
import { DropIcon } from 'phosphor-react-native/src/icons/Drop';
import { FlameIcon } from 'phosphor-react-native/src/icons/Flame';
import { ForkKnifeIcon } from 'phosphor-react-native/src/icons/ForkKnife';
import { GameControllerIcon } from 'phosphor-react-native/src/icons/GameController';
import { GasPumpIcon } from 'phosphor-react-native/src/icons/GasPump';
import { GiftIcon } from 'phosphor-react-native/src/icons/Gift';
import { GraduationCapIcon } from 'phosphor-react-native/src/icons/GraduationCap';
import { HandHeartIcon } from 'phosphor-react-native/src/icons/HandHeart';
import { HeartbeatIcon } from 'phosphor-react-native/src/icons/Heartbeat';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { LaptopIcon } from 'phosphor-react-native/src/icons/Laptop';
import { LetterCirclePIcon } from 'phosphor-react-native/src/icons/LetterCircleP';
import { LightningIcon } from 'phosphor-react-native/src/icons/Lightning';
import { MoneyIcon } from 'phosphor-react-native/src/icons/Money';
import { MusicNotesIcon } from 'phosphor-react-native/src/icons/MusicNotes';
import { PaletteIcon } from 'phosphor-react-native/src/icons/Palette';
import { PawPrintIcon } from 'phosphor-react-native/src/icons/PawPrint';
import { PiggyBankIcon } from 'phosphor-react-native/src/icons/PiggyBank';
import { PillIcon } from 'phosphor-react-native/src/icons/Pill';
import { PizzaIcon } from 'phosphor-react-native/src/icons/Pizza';
import { PlantIcon } from 'phosphor-react-native/src/icons/Plant';
import { PopcornIcon } from 'phosphor-react-native/src/icons/Popcorn';
import { ReceiptIcon } from 'phosphor-react-native/src/icons/Receipt';
import { RepeatIcon } from 'phosphor-react-native/src/icons/Repeat';
import { ScissorsIcon } from 'phosphor-react-native/src/icons/Scissors';
import { ShieldCheckIcon } from 'phosphor-react-native/src/icons/ShieldCheck';
import { ShoppingBagIcon } from 'phosphor-react-native/src/icons/ShoppingBag';
import { ShoppingCartIcon } from 'phosphor-react-native/src/icons/ShoppingCart';
import { SneakerIcon } from 'phosphor-react-native/src/icons/Sneaker';
import { StethoscopeIcon } from 'phosphor-react-native/src/icons/Stethoscope';
import { TagIcon } from 'phosphor-react-native/src/icons/Tag';
import { TelevisionIcon } from 'phosphor-react-native/src/icons/Television';
import { TrainIcon } from 'phosphor-react-native/src/icons/Train';
import { TShirtIcon } from 'phosphor-react-native/src/icons/TShirt';
import { WashingMachineIcon } from 'phosphor-react-native/src/icons/WashingMachine';
import { WifiHighIcon } from 'phosphor-react-native/src/icons/WifiHigh';
import { WrenchIcon } from 'phosphor-react-native/src/icons/Wrench';

import type { CategoryColor } from './tokens/palette.gen';

// F5 + F2: how a category looks. One icon set (Phosphor, duotone) on every platform, and one of
// ten colours. Categories carry their own `icon` and `color` (migration 46); the SF Symbol name
// is only a fallback for a row read before that. Icons are imported one by one: the package's
// index pulls in all 3,000 of them.

type IconProps = { size?: number; color?: string; weight?: 'duotone' | 'regular' | 'fill' | 'bold' };
type PhosphorIcon = ComponentType<IconProps>;

export const CATEGORY_ICONS: Record<string, PhosphorIcon> = {
  supermarket: ShoppingCartIcon, dining: ForkKnifeIcon, coffee: CoffeeIcon, takeaway: PizzaIcon, car: CarIcon,
  fuel: GasPumpIcon, bus: BusIcon, train: TrainIcon, parking: LetterCirclePIcon, housing: HouseIcon, mortgage: BankIcon,
  building: BuildingsIcon, tax: ReceiptIcon, electricity: LightningIcon, water: DropIcon, gas: FlameIcon,
  internet: WifiHighIcon, phone: DeviceMobileIcon, subscriptions: RepeatIcon, streaming: TelevisionIcon,
  health: StethoscopeIcon, pharmacy: PillIcon, fitness: BarbellIcon, wellbeing: HeartbeatIcon, insurance: ShieldCheckIcon,
  kids: BabyIcon, daycare: BackpackIcon, hobbies: PaletteIcon, education: GraduationCapIcon, books: BookOpenIcon,
  shopping: ShoppingBagIcon, clothes: TShirtIcon, shoes: SneakerIcon, grooming: ScissorsIcon, entertainment: PopcornIcon,
  music: MusicNotesIcon, games: GameControllerIcon, travel: AirplaneIcon, hotel: BedIcon, gifts: GiftIcon,
  holidays: ConfettiIcon, donations: HandHeartIcon, pets: PawPrintIcon, repairs: WrenchIcon, garden: PlantIcon,
  furniture: CouchIcon, appliances: WashingMachineIcon, tech: LaptopIcon, work: BriefcaseIcon, cash: MoneyIcon,
  card: CreditCardIcon, savings: PiggyBankIcon, tag: TagIcon, other: DotsThreeIcon,
};

// docs/design/foundations/icons.md: every SF Symbol a category can have today.
const FROM_SF: Record<string, string> = {
  cart: 'supermarket', 'fork.knife': 'dining', 'cup.and.saucer': 'coffee', car: 'car', fuelpump: 'fuel', bus: 'bus',
  house: 'housing', 'building.columns': 'mortgage', bolt: 'electricity', drop: 'water', wifi: 'internet',
  'arrow.triangle.2.circlepath': 'subscriptions', 'cross.case': 'health', pills: 'pharmacy', dumbbell: 'fitness',
  'figure.and.child.holdinghands': 'kids', graduationcap: 'education', bag: 'shopping', tshirt: 'clothes',
  scissors: 'grooming', popcorn: 'entertainment', gamecontroller: 'games', airplane: 'travel', gift: 'gifts',
  heart: 'donations', pawprint: 'pets', 'wrench.and.screwdriver': 'repairs', banknote: 'savings', creditcard: 'card',
  tag: 'tag', 'ellipsis.circle': 'other',
};

// docs/design/foundations/categories.md: the seeded categories' colours, so the first eight on
// screen are eight different ones. Any other icon gets a colour from its name.
const DEFAULT_COLOR: Record<string, CategoryColor> = {
  supermarket: 'teal', dining: 'sand', car: 'blue', fuel: 'ocean', housing: 'clay', electricity: 'olive', health: 'indigo',
  kids: 'sage', shopping: 'violet', entertainment: 'rose', subscriptions: 'olive', travel: 'teal', gifts: 'rose',
  education: 'blue', other: 'sand',
};
const ORDER: CategoryColor[] = ['teal', 'sand', 'blue', 'ocean', 'clay', 'olive', 'indigo', 'sage', 'violet', 'rose'];

export function categoryIconId(sfSymbol: string | null | undefined) {
  return FROM_SF[sfSymbol ?? ''] ?? (sfSymbol && CATEGORY_ICONS[sfSymbol] ? sfSymbol : null);
}

export function categoryColorId(sfSymbol: string | null | undefined): CategoryColor {
  const id = categoryIconId(sfSymbol);
  if (id && DEFAULT_COLOR[id]) return DEFAULT_COLOR[id];
  const key = id ?? sfSymbol ?? '';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ORDER[h % ORDER.length];
}

// What to draw for a category: its own icon and colour, else what its SF Symbol suggests.
export function lookOf(cat: { sf_symbol?: string | null; icon?: string | null; color?: string | null }) {
  const icon = cat.icon && CATEGORY_ICONS[cat.icon] ? cat.icon : categoryIconId(cat.sf_symbol);
  const color = (cat.color && (ORDER as string[]).includes(cat.color) ? cat.color : categoryColorId(cat.sf_symbol)) as CategoryColor;
  return { icon, color };
}

export const CATEGORY_COLORS = ORDER;

// The other way round, for sf_symbol on a category saved from the app: kept while older builds
// and the server's own inserts still read it. An icon with no SF counterpart saves as 'tag'.
export function sfFor(icon: string) {
  return Object.keys(FROM_SF).find((k) => FROM_SF[k] === icon) ?? 'tag';
}
