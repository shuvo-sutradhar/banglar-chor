import { NavGraph } from './navGraph';
import { BAZAAR_NAV_NODES, BAZAAR_OBSTACLES } from '../world/bazaarLayout';

/** Navigation graph for the haat (stalls, tree platform and benches are obstacles). */
export const BAZAAR_NAV = new NavGraph(BAZAAR_NAV_NODES, BAZAAR_OBSTACLES, 0.45);
