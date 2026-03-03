import { NextResponse } from 'next/server';

import { getPolicies } from '@/lib/public-demo-api';

export async function GET() {
  return NextResponse.json(getPolicies());
}
