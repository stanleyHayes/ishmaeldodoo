import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";

const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);

@Injectable()
export class UnsafeInputPipe implements PipeTransform {
  transform(value: unknown): unknown {
    let visited = 0;
    const inspect = (candidate: unknown, depth: number): void => {
      visited += 1;
      if (depth > 20 || visited > 10_000)
        throw new BadRequestException("Request structure is too complex");
      if (!candidate || typeof candidate !== "object") return;
      if (Array.isArray(candidate)) {
        candidate.forEach((item) => inspect(item, depth + 1));
        return;
      }
      for (const [key, nested] of Object.entries(candidate)) {
        if (key.startsWith("$") || key.includes(".") || forbiddenKeys.has(key))
          throw new BadRequestException(
            "Request contains an unsafe field name",
          );
        inspect(nested, depth + 1);
      }
    };
    inspect(value, 0);
    return value;
  }
}
