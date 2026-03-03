import { NextResponse } from 'next/server';

import { getChanges } from '@/lib/public-demo-api';

export async function GET() {
  return NextResponse.json(getChanges());
}
