import { NextResponse } from 'next/server';

import { getDemoResetPayload } from '@/lib/public-demo-api';

export async function POST() {
  return NextResponse.json(getDemoResetPayload());
}
