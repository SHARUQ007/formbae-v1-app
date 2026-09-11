import { AppState } from 'react-native';
import { configureMonitoring, flushMonitoring, observeApiResult, observeAppEvent, observeScreen } from './monitoringService';
jest.mock('react-native',()=>({Platform:{OS:'ios'},AppState:{currentState:'active',addEventListener:jest.fn(()=>({remove:jest.fn()}))}}));
jest.mock('../constants/config',()=>({API_PREFIX:'/api/mobile',getBackendApiBaseUrl:()=> 'https://api.example.test'}));
const fetchMock=jest.fn();
function sentEvents(index=0) { return JSON.parse(fetchMock.mock.calls[index][1].body).events as {type:string;name:string;durationMs:number;screen:string}[]; }
beforeEach(()=>{
  jest.useFakeTimers();
  globalThis.fetch=fetchMock;
  fetchMock.mockReset().mockResolvedValue({ok:true,status:200,json:async()=>({enabled:true}),headers:{get:()=>null}});
  configureMonitoring('member-token');
});
afterEach(()=>{configureMonitoring(null);jest.clearAllTimers();jest.useRealTimers();});
test('screen transitions count repeat visits and foreground duration',async()=>{
  observeScreen('/mobile/Main/Workouts/WorkoutList');
  observeScreen('/mobile/Main/Workouts/WorkoutList');
  jest.advanceTimersByTime(2000);
  observeScreen('/mobile/Main/Diet');
  observeScreen('/mobile/Main/Workouts/WorkoutList');
  await flushMonitoring();
  const rows=sentEvents();
  expect(rows.filter(row=>row.type==='screen_view').map(row=>row.name)).toEqual(['WorkoutList','Diet','WorkoutList']);
  expect(rows.find(row=>row.type==='screen_time')?.durationMs).toBe(2000);
});
test('never sends URL parameters, request bodies or a previous account queue',async()=>{
  observeScreen('/mobile/Main/Profile/GymPicker');
  observeApiResult('/gyms?query=PRIVATE&key=SECRET',100,500,'member-token');
  await flushMonitoring();
  const body=fetchMock.mock.calls[0][1].body;
  expect(body).not.toContain('PRIVATE'); expect(body).not.toContain('SECRET');
  expect(sentEvents().find(row=>row.type==='api_request')?.name).toBe('gyms');
  observeAppEvent('article_open','nutrition');
  configureMonitoring('other-token');
  observeApiResult('/gyms',100,500,'member-token');
  await flushMonitoring();
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer other-token');
  expect(sentEvents(1).map(row=>row.type)).toEqual(['session_start']);
});
test('queue and batches stay bounded and rate limiting stops retries',async()=>{
  for(let index=0;index<200;index++) observeAppEvent('image_load','bundled',10,'ok');
  fetchMock.mockResolvedValueOnce({ok:false,status:429,headers:{get:()=> '86400'}});
  await flushMonitoring();
  expect(sentEvents()).toHaveLength(40);
  observeAppEvent('article_open','nutrition');
  await flushMonitoring();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('disabled collection discards new observations until the next check window',async()=>{
  fetchMock.mockResolvedValueOnce({ok:true,status:200,json:async()=>({enabled:false}),headers:{get:()=>null}});
  await flushMonitoring();
  observeAppEvent('article_open','nutrition');
  await flushMonitoring();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('feature state polling does not inflate panel visits',async()=>{
  observeAppEvent('feature_view','partner_search');
  observeAppEvent('feature_view','partner_search');
  observeAppEvent('feature_view','partner_invite');
  await flushMonitoring();
  expect(sentEvents().filter(row=>row.type==='feature_view')).toHaveLength(2);
});
test('background time is excluded from screen engagement',async()=>{
  observeScreen('/mobile/Main/Diet');
  jest.advanceTimersByTime(3000);
  const listener=(AppState.addEventListener as jest.Mock).mock.calls.at(-1)[1];
  listener('background');
  await Promise.resolve(); await Promise.resolve();
  const rows=sentEvents();
  expect(rows.find(row=>row.type==='screen_time')?.durationMs).toBe(3000);
  jest.advanceTimersByTime(60000);
  listener('active');
  jest.advanceTimersByTime(1000);
  observeScreen('/mobile/Main/Workouts/WorkoutList');
  await flushMonitoring();
  expect(sentEvents(1).find(row=>row.type==='screen_time')?.durationMs).toBe(1000);
});
