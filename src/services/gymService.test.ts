import { apiRequest } from './apiClient';
import { fetchGym, searchGyms } from './gymService';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

const request = jest.mocked(apiRequest);

describe('gym service', () => {
  beforeEach(() => request.mockReset());

  it('does not use search quota for incomplete queries', async () => {
    await expect(searchGyms('ab')).resolves.toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it('encodes an explicit gym search and avoids automatic retries', async () => {
    request.mockResolvedValue({ places: [{ placeId: 'place-1', name: 'Core Gym', address: 'Kochi' }] });

    await expect(searchGyms('Core Gym & Kochi')).resolves.toHaveLength(1);

    expect(request).toHaveBeenCalledWith('/gyms/search?q=Core%20Gym%20%26%20Kochi', expect.objectContaining({ retries: 0 }));
  });

  it('loads a selected gym by Place ID', async () => {
    request.mockResolvedValue({ place: { placeId: 'ChIJ12345678', name: 'Core Gym', address: 'Kochi' } });

    await expect(fetchGym('ChIJ12345678')).resolves.toEqual(expect.objectContaining({ name: 'Core Gym' }));
    expect(request).toHaveBeenCalledWith('/gyms/ChIJ12345678', expect.objectContaining({ retries: 0 }));
  });
});
