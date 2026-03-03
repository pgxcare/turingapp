import { Tooltip } from '@/components/ui/tooltip';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function MetricCard({
  title,
  value,
  trend,
  description
}: {
  title: string;
  value: string | number;
  trend: string;
  description: string;
}) {
  return (
    <Card className="bg-white/85">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          <Tooltip text={description}>{title}</Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="text-xs text-muted-foreground">{trend}</p>
      </CardContent>
    </Card>
  );
}
