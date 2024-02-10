# Zeonic
ZeonDB SDK for the Bun.js runtime

<img src="./logo.png" width=256>

## Usage
```ts
import { initZeonDB, ZeonDB, Key } from "zeonic";

const db = new ZeonDB("127.0.0.1", 6748);

if (await db.login("user", "pass")) {
    await db.set(Key("hello"), "world");

    let res = await db.get(Key("hello"));
    if (res.ok) {
        console.log(res.value);
    } else {
        throw new Error(err.msg);
    }
} else {
    throw new Error(await db.get_error());
}

await db.disconnect();
```

## Documentation
> TODO <br>
> For now look into `test.ts`
