export const SAMPLE_ADDRESS = '0x1111111111111111111111111111111111111111';

export const SAMPLE_ROWS = [
  {
    token_id: 1,
    creator: SAMPLE_ADDRESS,
    fulfiller: '0x2222222222222222222222222222222222222222',
    owner: SAMPLE_ADDRESS,
    state: 1,
    description: 'Self-minted self-owned active IOU',
    service_type: 'General',
  },
  {
    token_id: 2,
    creator: '0x3333333333333333333333333333333333333333',
    fulfiller: '0x4444444444444444444444444444444444444444',
    owner: SAMPLE_ADDRESS,
    state: 2,
    description: 'Historical settled IOU owned by querier',
    service_type: 'General',
  },
  {
    token_id: 3,
    creator: '0x5555555555555555555555555555555555555555',
    fulfiller: SAMPLE_ADDRESS,
    owner: '0x6666666666666666666666666666666666666666',
    state: 1,
    description: 'Pure fulfiller active IOU',
    service_type: 'General',
  },
];

export const SAMPLE_ENRICHED = {
  1: { state: 1, description: 'Self-minted self-owned active IOU', serviceType: 'General' },
  2: { state: 2, description: 'Historical settled IOU owned by querier', serviceType: 'General' },
  3: { state: 1, description: 'Pure fulfiller active IOU', serviceType: 'General' },
};
