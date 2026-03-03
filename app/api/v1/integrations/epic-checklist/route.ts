import { NextResponse } from 'next/server';

import { getEpicChecklist } from '@/lib/public-demo-api';

export async function GET() {
  return NextResponse.json(getEpicChecklist());
}
