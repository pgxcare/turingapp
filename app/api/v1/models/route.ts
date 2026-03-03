import { NextResponse } from 'next/server';

import { getModels } from '@/lib/public-demo-api';

export async function GET() {
  return NextResponse.json(getModels());
}
