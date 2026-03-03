import { NextResponse } from 'next/server';

import { queryAuditCases } from '@/lib/public-demo-api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(queryAuditCases(searchParams));
}
