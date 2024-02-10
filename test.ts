import { initZeonDB, ZeonDB, Key, Account } from "./index.ts";

initZeonDB("../ZeonDB/build/libZeonCAPI.so");

function create_blog(title, author, ...args) {
	return {
		title,
		author,
		tags: args[0]
	};
}

const db = new ZeonDB("127.0.0.1", 6748);

// cached key
const docRef = Key("users").setBranch("theo");

const data = Array(32768).fill(create_blog("blog", "amogus", "this will kill my pc for sure".split(" ")))
console.log(JSON.stringify(data).length);

if (await db.login("admin", "admin")) {
	let res = await db.set(docRef, data);

	res = await db.get(docRef);
	if (res.ok) {
		// console.log(res.value);
	} else {
		throw new Error(res.msg);
	}

    res = await db.config();

	if (res.ok) {
		console.log(res.value);
	} else {
		throw new Error(res.msg);
	}

    await db.set(Key("hello").chainWith(Key("world")), "hey");
    await db.link(Key("hello").chainWith(Key("svet")), Key("$").chainWith(Key("world")));

    res = await db.get(Key("hello"));

	if (res.ok) {
		console.log(res.value);
	} else {
		throw new Error(res.msg);
	}

    const acc = new Account("theo");
    res = await db.auth(acc.create("paris"));

	if (res.ok) {
		console.log(res.value);
	} else {
		throw new Error(res.msg);
	}

    await db.auth(acc.promote());

    res = await db.get_branches(Key("users"));

	if (res.ok) {
		console.log(res.value);
	} else {
		throw new Error(res.msg);
	}

    res = await db.merge(Key("users"), "default", "theo"); 
    if (res.ok) {
        console.log(res.value);
    } else {
        throw new Error(res.msg);
    }

    res = await db.get(Key("users"));

    if (res.ok) {
        // console.log(res.value);
    } else {
        throw new Error(res.msg);
    }

    /*
    res = await db.delete(Key("users"));
    console.log("Users were deleted!");

	if (res.ok) {
		console.log(res.value);
	} else {
		throw new Error(res.msg);
	}
    */

    const company_template = {
        name: "",
        employees: [],
        projects: []
    };

    await db.new_template("company", company_template);

    res = await db.get_template("company");
    if (res.ok) {
        console.log(res.value);
    } else {
        throw new Error(res.msg);
    }

    await db.set(Key("companies"), {});

    const oven = Key("companies").setBranch("Oven");
    const deno = Key("companies").setBranch("Deno");

    await db.use_template("company", oven);
    await db.use_template("company", deno);

	res = await db.get_branches(Key("companies"));
	if (res.ok) {
        for (let org of res.value) {
            let res2 = await db.get(Key("companies").setBranch(org));
            if (res2.ok) {
                console.log(`${org} => ${JSON.stringify(res2.value)}`);
            } else {
                throw new Error(res2.msg);
            }
        }
	} else {
		throw new error(res.msg);
	}
} else {
	console.log(await db.get_error());
}

await db.disconnect();
