import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WorkoutHistoryDetailScreen } from './WorkoutHistoryDetailScreen';
import type { WorkoutHistoryEntry } from '../../types/api';
import { WeeklyBodyMap } from '../../components/WeeklyBodyMap';

jest.mock('@react-navigation/bottom-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
jest.mock('../../hooks/useProfileBodyGender', () => ({ useProfileBodyGender: () => 'female' }));
jest.mock('../../components/WeeklyBodyMap', () => ({ WeeklyBodyMap: jest.fn(() => null) }));
const base: WorkoutHistoryEntry = {date:'2026-08-25',planId:'old',planDayId:'day',workoutMode:'standard',title:'Lower body strength',muscleGroups:['Quads','Glutes']};
const render = (session: WorkoutHistoryEntry) => create(<WorkoutHistoryDetailScreen route={{name:'WorkoutHistoryDetail',key:'detail',params:{session}}} navigation={{goBack:jest.fn()} as never} />);
const text = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text).flatMap(node => [node.props.children].flat(Infinity).filter(child => typeof child === 'string')).join(' ');
it('shows the selected exercise, SVG muscle targets and actual logged performance', () => {
  let tree!: ReturnType<typeof create>;
  act(()=>{tree=render({...base,detailsSource:'snapshot',exercises:[{exerciseId:'leg-press',name:'Leg press',muscleGroups:['Quads','Glutes'],completed:true,plannedSets:'3',plannedReps:'10',sets:[{setNumber:'1',reps:'8',weight:'45'}]}]});});
  expect(text(tree)).toContain('Lower body strength');
  expect(text(tree)).toContain('Leg press');
  expect(text(tree)).toContain('8 reps · 45 kg');
  expect(text(tree)).toContain('Planned: ');
  expect(WeeklyBodyMap).toHaveBeenCalledWith(expect.objectContaining({muscles:['Quads','Glutes'],gender:'female'}),undefined);
  act(()=>tree.unmount());
});
it('labels legacy plan details and gracefully handles missing history metadata', () => {
  let tree!: ReturnType<typeof create>;
  act(()=>{tree=render({...base,detailsSource:'plan',exercises:[]});});
  expect(text(tree)).toContain('Exact performance wasn’t saved');
  expect(text(tree)).toContain('Exercise details weren’t saved');
  expect(text(tree)).not.toContain('LOGGED SETS');
  act(()=>tree.unmount());
});
it('identifies a saved prescription without claiming its planned sets were performed', () => {
  let tree!: ReturnType<typeof create>;
  act(()=>{tree=render({...base,detailsSource:'snapshot',exercises:[{exerciseId:'squat',name:'Goblet squat',muscleGroups:['Quads'],plannedSets:'3',plannedReps:'10',sets:[]}]});});
  expect(text(tree)).toContain('Individual exercise performance wasn’t recorded');
  expect(text(tree)).toContain('Session plan');
  expect(text(tree)).not.toContain('LOGGED SETS');
  act(()=>tree.unmount());
});
