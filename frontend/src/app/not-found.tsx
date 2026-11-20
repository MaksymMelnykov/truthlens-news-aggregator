import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-20">
      <Card className="items-center text-center p-8 sm:p-10">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-secondary text-primary">
          <Compass className="size-6" />
        </div>
        <div className="flex flex-col gap-2 max-w-md">
          <span className="text-xs font-mono uppercase tracking-wider text-accent tabular-nums">
            Помилка 404
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Сторінку не знайдено
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Запитаний матеріал або розділ переміщено чи видалено. Перевірте адресу посилання або поверніться до головної стрічки новин.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button asChild variant="default">
            <Link href="/">На головну стрічку</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/verify">Перевірити новину</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

