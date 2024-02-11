import { initZeonDB, ZeonDB, Key, Account } from "./index.ts";

initZeonDB("../ZeonDB/build/libZeonCAPI.so");

function create_blog(title, author, ...args) {
	return {
		title,
		author,
		tags: args[0]
	};
}

const key = Key("lol");
console.log(key.clone().setBranch("hm"));
console.log(key);
