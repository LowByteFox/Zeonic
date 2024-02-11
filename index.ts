import { dlopen } from "bun:ffi";

let dylib: unknown;
const text_encoder = new TextEncoder();

export function initZeonDB(path: string): void {
	dylib = dlopen(
		path,
		{
			"ZeonAPI_Connection_create":
			{
				args: ["cstring", "u16"],
				returns: "ptr",
			},
			"ZeonAPI_Connection_destroy":
			{
				args: ["ptr"],
				returns: "void",
			},
			"ZeonAPI_Connection_is_up":
			{
				args: ["ptr"],
				returns: "i32",
			},
			"ZeonAPI_Connection_get_error":
			{
				args: ["ptr"],
				returns: "cstring",
			},
			"ZeonAPI_Connection_get_buffer":
			{
				args: ["ptr"],
				returns: "cstring",
			},
			"ZeonAPI_Connection_auth":
			{
				args: ["ptr", "cstring", "cstring"],
				returns: "i32",
			},
			"ZeonAPI_Connection_exec":
			{
				args: ["ptr", "cstring"],
				returns: "i32",
			},
		},
	);
}

interface ZeonResult {
	ok: boolean,
	value: unknown,
	msg: string,
}

interface ZeonKey {
	path: string,
	branch: string,
	index: number,
	next?: ZeonKey,
	setBranch: (branch: string) => ZeonKey,
	setIndex: (index: number) => ZeonKey,
	chainWith: (key: ZeonKey) => ZeonKey,
    clone: () => ZeonKey,
	stringify: () => string,
}

interface ZeonPerms {
    read: boolean,
    write: boolean,
    stringify: () => string,
}

enum AuthRequestType {
    CREATE = 1,
    GET,
    SET,
    PROMOTE,
    DEMOTE,
    DELETE
}

interface AuthRequest {
    req: AuthRequestType,
    payload: {
        username: string,
        password?: string,
        key?: ZeonKey,
        perms?: ZeonPerms,
    }
}

export function Permission(read: boolean, write: boolean): ZeonPerms {
    return {
        read, write,
        stringify: function() {
            return `{can_write: ${this.write}, can_read: ${this.read} }`;
        }
    };
}

export function Key(pth: string): ZeonKey {
	let path = pth;
	let branch = "";
	let index = -1;

	return {
		path,
		branch,
		index,
		next: null,

		setBranch: function(branch: string) {
			this.branch = branch;
			return this;
		},

		setIndex: function(index: number) {
			if (index < 0) {
				throw "Index cannot be less than 0!"
			}
			this.index = index;
			return this;
		},

        clone: function() {
            let new_k = Key(this.path);
            new_k.branch = this.branch;
            new_k.index = this.index;
            new_k.next = this.next;
            return new_k;
        },

		chainWith: function(next: ZeonKey) {
			this.next = next;
			return this;
		},

		stringify: function() {
			let str = this.path;
			if (this.branch.length > 0) {
				str += `@${this.branch}`
			}

			if (this.index > -1) {
				str += `[${this.index}]`
			}

			if (this.next) {
				str += `.${this.next.stringify()}`
			}

			return str;
		}
	};
}

export class Account {
    private username: string;

    public constructor(username: string) {
        this.username = username;
    }

    public create(password: string, perms?: ZeonPerms): AuthRequest {
        if (perms) {
            return {
                req: AuthRequestType.CREATE,
                payload: {
                    username: this.username,
                    password,
                    perms
                }
            };
        }
        return {
            req: AuthRequestType.CREATE,
            payload: {
                username: this.username,
                password,
                perms: Permission(true, true)
            }
        };
    }

    public get_perms(key: ZeonKey): AuthRequest {
        return {
            req: AuthRequestType.GET,
            payload: {
                username: this.username,
                key
            }
        };
    }

    public set_perms(key: ZeonKey, perms: ZeonPerms): AuthRequest {
        return {
            req: AuthRequestType.SET,
            payload: {
                username: this.username,
                key,
                perms
            }
        };
    }

    public promote(): AuthRequest {
        return {
            req: AuthRequestType.PROMOTE,
            payload: {
                username: this.username
            }
        };
    }

    public demote(): AuthRequest {
        return {
            req: AuthRequestType.DEMOTE,
            payload: {
                username: this.username
            }
        };
    }

    public delete(): AuthRequest {
        return {
            req: AuthRequestType.DELETE,
            payload: {
                username: this.username
            }
        };
    }
}

export class ZeonDB {
	private connection: unknown;
    private username?: string;

	constructor(ip: string, port: number) {
		    this.connection = dylib.symbols.ZeonAPI_Connection_create(text_encoder.encode(ip + "\0"), port);
	}

	public async login(username: string, password: string): Promise<boolean> {
        this.username = username;
		const u = text_encoder.encode(username + "\0");
		const p = text_encoder.encode(password + "\0");
		const res = dylib.symbols.ZeonAPI_Connection_auth(this.connection, u, p) == 1;

        if (res) {
            this.config("format", "JSON"); // this will never fail
        }

        return Promise.resolve(res);
	}

	public async get_error(): Promise<string> {
	    return Promise.resolve(dylib.symbols.ZeonAPI_Connection_get_error(this.connection));
	}

	public async get_output(): Promise<string> {
        return Promise.resolve(dylib.symbols.ZeonAPI_Connection_get_buffer(this.connection));
	}

    private async newResult(res: bool): Promise<ZeonResult> {
		if (res) {
            const out = await this.get_output();
			return Promise.resolve({
				ok: res,
				value: out == "OK" ? out : JSON.parse(await this.get_output()),
			});
		}

		return Promise.resolve({
			ok: res,
			msg: await this.get_error(),
		});
    }

	public async set(key: Key, value: unknown): Promise<ZeonResult> {
		return this.newResult(await this.exec(`set ${key.stringify()} ${JSON.stringify(value)}`));
	}

    public async merge(key: Key, branch1: string, branch2: string): Promise<ZeonResult> {
        return this.newResult(await this.exec(`branches merge ${key.stringify()} ${branch1} ${branch2}`));
    }

    public async get_branches(key: Key): Promise<ZeonResult> {
        return this.newResult(await this.exec(`branches get ${key.stringify()}`));
    }

    public async get_template(name: string): Promise<ZeonResult> {
        return this.newResult(await this.exec(`template get ${name}`));
    }

    public async use_template(name: string, key: Key): Promise<ZeonResult> {
        return this.newResult(await this.exec(`template set ${name} ${key.stringify()}`));
    }

    public async new_template(name: string, template: unknonw): Promise<ZeonResult> {
        return this.newResult(await this.exec(`template create ${name} ${JSON.stringify(template)}`));
    }

	public async get(key: Key): Promise<ZeonResult> {
		return this.newResult(await this.exec(`get ${key.stringify()}`));
	}

    public async link(key: Key, target: Key): Promise<ZeonResult> {
        return this.newResult(await this.exec(`link ${key.stringify()} ${target.stringify()}`));
    }

    public async delete(key: Key): Promise<ZeonResult> {
        return this.newResult(await this.exec(`delete ${key.stringify()}`));
    }

    public async config(key?: string, value?: unknown): Promise<boolean> {
        if (value && key) {
            if (key == "format" && value != "JSON") return {ok: false, msg: "Format must be JSON"};

            return this.newResult(await this.exec(`options set ${key} ${JSON.stringify(value)}`));
        } else if (key && !value) {
            return this.newResult(await this.exec(`options get ${key}`));
        }

        return this.newResult(await this.exec("options print"));
    }

    public async array_push(key: Key, value: unknown): Promise<ZeonResult> {
        return this.newResult(await this.exec(`array push ${key.stringify()} ${JSON.stringify(value)}`));
    }

    public async array_insert(key: Key, index: number, value: unknown): Promise<ZeonResult> {
        return this.newResult(await this.exec(`array insert ${key.stringify()} ${index} ${JSON.stringify(value)}`));
    }

    public async array_erase(key: Key, index: number): Promise<ZeonResult> {
        return this.newResult(await this.exec(`array erase ${key.stringify()} ${index}`));
    }

    public async array_length(key: Key): Promise<ZeonResult> {
        return this.newResult(await this.exec(`array length ${key.stringify()}`));
    }

    public async auth(req: AuthRequest): Promise<ZeonResult> {
        const { payload } = req;
        switch (req.req) {
            case AuthRequestType.CREATE:
                return this.newResult(await this.exec(`auth create ${payload.username} ${payload.password} ${payload.perms.stringify()}`));
            case AuthRequestType.GET:
                if (payload.username == this.username) {
                    return this.newResult(await this.exec(`auth get ${payload.key.stringify()}`));
                } else {
                    return this.newResult(await this.exec(`auth get ${payload.key.stringify()} of ${payload.username}`));
                }
            case AuthRequestType.SET:
                if (payload.username == this.username) {
                    return this.newResult(await this.exec(`auth set ${payload.key.stringify()} ${payload.perms.stringify()}`));
                } else {
                    return this.newResult(await this.exec(`auth set ${payload.key.stringify()} ${payload.perms.stringify()} to ${payload.username}`));
                }
            case AuthRequestType.PROMOTE:
                return this.newResult(await this.exec(`auth promote ${payload.username}`));
            case AuthRequestType.DEMOTE:
                return this.newResult(await this.exec(`auth demote ${payload.username}`));
            case AuthRequestType.DELETE:
                return this.newResult(await this.exec(`auth delete ${payload.username}`));
        }
    }

	private async exec(code: string): boolean {
		const c = text_encoder.encode(code + "\0");
		return Promise.resolve(dylib.symbols.ZeonAPI_Connection_exec(this.connection, c) == 1);
	}

	public async disconnect(): Promise<void> {
		dylib.symbols.ZeonAPI_Connection_destroy(this.connection);
	}
}
