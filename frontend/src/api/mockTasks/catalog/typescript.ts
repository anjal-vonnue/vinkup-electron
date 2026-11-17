// Generated from the Phase 1 and Phase 2 Trainee Guides (task text is the guides' wording).
// Task ids follow the day page: `${dayId}-t-${sequenceOrder}`.
import type { CatalogDay } from '../types';

export const typescriptDays: CatalogDay[] = [
  {
    dayId: 'ts-day-01',
    dayNumber: 1,
    courseTitle: 'TypeScript',
    tasks: [
      {
        id: 'ts-day-01-t-1',
        sequenceOrder: 1,
        title: 'Setup & First TypeScript Project',
        isStretchGoal: false,
        estimatedMinutes: 30,
        instructionsMarkdown:
          "**TypeScript · Day 1: TypeScript Setup, Basic Types & Type Inference** · Task 1 of 8 · about 30 min\n\n## Today's goal\nBy the end of the day you will have built a TypeScript project with strict mode, all Week 3 utility functions converted with zero implicit any.\n\n## What to do\n\n1. Install TypeScript: npm install -g typescript. Verify: tsc --version\n2. Create tsconfig.json: strict: true, target: ES2022, module: commonjs, outDir: dist, rootDir: src\n3. Create src/hello.ts with greet(name: string): string. Compile with tsc. Run the output.\n4. Add a build script and a watch script (tsc --watch) to package.json\n5. Introduce a deliberate type error - understand the error message, then fix it\n",
      },
      {
        id: 'ts-day-01-t-2',
        sequenceOrder: 2,
        title: 'Everyday Types',
        isStretchGoal: false,
        estimatedMinutes: 40,
        instructionsMarkdown:
          "**TypeScript · Day 1: TypeScript Setup, Basic Types & Type Inference** · Task 2 of 8 · about 40 min\n\n## Today's goal\nBy the end of the day you will have built a TypeScript project with strict mode, all Week 3 utility functions converted with zero implicit any.\n\n## What to do\n\n1. Annotate 20 variables: string, number, boolean, null, undefined, symbol, bigint, any (then replace with a better type), unknown, never, void, object, array, and tuple\n2. Write five functions with explicit parameter types and return types. Try omitting the return type - verify inference works for simple cases.\n3. Show const vs let inference: const greeting = 'Hello' is the literal type 'Hello'; let is string\n4. Write a function accepting string | number - use typeof guards to handle each case differently\n",
      },
      {
        id: 'ts-day-01-t-3',
        sequenceOrder: 3,
        title: 'Interfaces & Object Types',
        isStretchGoal: false,
        estimatedMinutes: 45,
        instructionsMarkdown:
          "**TypeScript · Day 1: TypeScript Setup, Basic Types & Type Inference** · Task 3 of 8 · about 45 min\n\n## Today's goal\nBy the end of the day you will have built a TypeScript project with strict mode, all Week 3 utility functions converted with zero implicit any.\n\n## What to do\n\n1. Define User interface: id, name, email, role ('admin' | 'viewer' | 'editor'), createdAt, optional avatar?: string\n2. Create five objects satisfying the interface. Try adding an extra property - see the excess property check error.\n3. Create ReadonlyUser = Readonly`<User>`. Show you cannot mutate its properties.\n4. Write updateUser(user: User, changes: Partial`<User>`): User returning a new merged user\n5. Show the difference between interface and type alias - mostly interchangeable but different extension syntax\n",
      },
      {
        id: 'ts-day-01-t-4',
        sequenceOrder: 4,
        title: 'Convert Week 3 Utils - Zero any',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 1: TypeScript Setup, Basic Types & Type Inference** · Task 4 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built a TypeScript project with strict mode, all Week 3 utility functions converted with zero implicit any.\n\n## What to do\n\n1. Rename debounce.js, fetchJSON.js, memoize.js, pipe.js, EventEmitter.js to .ts\n2. Run tsc - fix every error without adding any\n3. Use unknown with type guards where type is genuinely uncertain\n4. Add explicit return type annotations to every exported function\n5. Zero TypeScript errors. Zero any types.\n",
      },
      {
        id: 'ts-day-01-t-5',
        sequenceOrder: 5,
        title: 'Type Narrowing & Type Guards',
        isStretchGoal: false,
        estimatedMinutes: 55,
        instructionsMarkdown:
          "**TypeScript · Day 1: TypeScript Setup, Basic Types & Type Inference** · Task 5 of 8 · about 55 min\n\n## Today's goal\nBy the end of the day you will have built a TypeScript project with strict mode, all Week 3 utility functions converted with zero implicit any.\n\n## What to do\n\n1. Write processInput(value: string | number | boolean | null | undefined) using typeof, equality, and nullish narrowing\n2. Write custom type guard isUser(value: unknown): value is User that validates an unknown API response\n3. Use discriminated unions: Shape = { kind: 'circle'; radius: number } | { kind: 'rect'; w: number; h: number }. Write getArea using exhaustive switch.\n4. Show the never type: add a new Shape variant, TypeScript catches the missing case\n",
      },
      {
        id: 'ts-day-01-t-6',
        sequenceOrder: 6,
        title: 'Convert CartModule to TypeScript',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 1: TypeScript Setup, Basic Types & Type Inference** · Task 6 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built a TypeScript project with strict mode, all Week 3 utility functions converted with zero implicit any.\n\n## What to do\n\n1. Define CartItem, Cart, and Coupon interfaces\n2. Type observer callbacks: observers: Array<(state: Cart) => void>\n3. All methods have explicit return types\n4. Zero errors. Zero any.\n",
      },
      {
        id: 'ts-day-01-t-7',
        sequenceOrder: 7,
        title: 'Type Declarations for Third-Party Code',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 1: TypeScript Setup, Basic Types & Type Inference** · Task 7 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built a TypeScript project with strict mode, all Week 3 utility functions converted with zero implicit any.\n\n## What to do\n\n1. Install @types/node. Show how it adds types to Node built-ins.\n2. Write a declaration file src/types/some-library.d.ts declaring a fictional untyped module with three exports\n3. Use the satisfies operator: const palette = { primary: '#0D9488' } satisfies Record`<string, string>` - explain when it's better than a type annotation\n4. Write ambient declaration for a build-tool global: declare const __APP_VERSION__: string\n",
      },
      {
        id: 'ts-day-01-t-8',
        sequenceOrder: 8,
        title: 'Strict Mode Deep Dive',
        isStretchGoal: false,
        estimatedMinutes: 45,
        instructionsMarkdown:
          "**TypeScript · Day 1: TypeScript Setup, Basic Types & Type Inference** · Task 8 of 8 · about 45 min\n\n## Today's goal\nBy the end of the day you will have built a TypeScript project with strict mode, all Week 3 utility functions converted with zero implicit any.\n\n## What to do\n\n1. Enable each strict flag individually and explain what it catches: noImplicitAny, strictNullChecks, strictFunctionTypes, noUncheckedIndexedAccess\n2. Show a real bug strictNullChecks catches: function may return undefined, used without null check\n3. Show a real bug noUncheckedIndexedAccess catches: arr[0] accessed without length check\n4. Document enabled options and why in TS_DECISIONS.md\n",
      },
      {
        id: 'ts-day-01-t-9',
        sequenceOrder: 9,
        title: 'Convert FormValidator to TypeScript with full generics: FormValidator<T extends…',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**TypeScript · Day 1: TypeScript Setup, Basic Types & Type Inference** · Daily challenge (stretch goal)\n\n> Attempt this only when every main task for today is finished. Never skip a main task for it.\n\n## Challenge\nConvert FormValidator to TypeScript with full generics: FormValidator<T extends Record`<string, unknown>`>(form, rules: ValidationRules`<T>`). Return type is ValidationResult`<T>` with field-level errors. Zero any.\n',
      },
    ],
  },
  {
    dayId: 'ts-day-02',
    dayNumber: 2,
    courseTitle: 'TypeScript',
    tasks: [
      {
        id: 'ts-day-02-t-1',
        sequenceOrder: 1,
        title: 'Generic Functions & Constraints',
        isStretchGoal: false,
        estimatedMinutes: 40,
        instructionsMarkdown:
          "**TypeScript · Day 2: Generics, Utility Types & Advanced Type Patterns** · Task 1 of 8 · about 40 min\n\n## Today's goal\nBy the end of the day you will have built a generic typed API client, type-safe state manager, and all Week 4 data structures fully typed.\n\n## What to do\n\n1. Write identity`<T>`(arg: T): T. Test with string, number, custom types.\n2. Write first`<T>`(arr: T[]): T | undefined returning the first element of any array\n3. Write fetchData`<T>`(url: string): Promise`<T>` that parses the response as T\n4. Write getProperty`<T, K extends keyof T>`(obj: T, key: K): T[K] - the typed property accessor\n5. Build a generic Queue`<T>` class with enqueue, dequeue, peek, isEmpty\n",
      },
      {
        id: 'ts-day-02-t-2',
        sequenceOrder: 2,
        title: 'Utility Types in Practice',
        isStretchGoal: false,
        estimatedMinutes: 45,
        instructionsMarkdown:
          "**TypeScript · Day 2: Generics, Utility Types & Advanced Type Patterns** · Task 2 of 8 · about 45 min\n\n## Today's goal\nBy the end of the day you will have built a generic typed API client, type-safe state manager, and all Week 4 data structures fully typed.\n\n## What to do\n\n1. Write updateUser(id: string, changes: Partial`<User>`): Promise`<User>`\n2. Write createRequiredUser(data: Required`<User>`): User enforcing all fields are present\n3. Build UserPreview = Pick`<User, 'id' | 'name' | 'avatar'>` - return type for a list endpoint\n4. Build UserInput = Omit`<User, 'id' | 'createdAt'>` - parameter type for a create endpoint\n5. Build a typed config using Record`<ConfigKey, string>` where ConfigKey is a union of literal strings\n",
      },
      {
        id: 'ts-day-02-t-3',
        sequenceOrder: 3,
        title: 'Discriminated Unions for API Responses',
        isStretchGoal: false,
        estimatedMinutes: 45,
        instructionsMarkdown:
          "**TypeScript · Day 2: Generics, Utility Types & Advanced Type Patterns** · Task 3 of 8 · about 45 min\n\n## Today's goal\nBy the end of the day you will have built a generic typed API client, type-safe state manager, and all Week 4 data structures fully typed.\n\n## What to do\n\n1. Define ApiResponse`<T>` = { success: true; data: T } | { success: false; error: string; statusCode: number }\n2. Write handleResponse`<T>`(response: ApiResponse`<T>`) that TypeScript narrows correctly in each branch\n3. Define LoadingState`<T>`: idle | loading | { status: 'success'; data: T } | { status: 'error'; error: Error }\n4. Use LoadingState`<User[]>` in a function that returns the correct HTML string for each state\n",
      },
      {
        id: 'ts-day-02-t-4',
        sequenceOrder: 4,
        title: 'Mapped Types',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 2: Generics, Utility Types & Advanced Type Patterns** · Task 4 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built a generic typed API client, type-safe state manager, and all Week 4 data structures fully typed.\n\n## What to do\n\n1. Implement Readonly`<T>` from scratch: type MyReadonly`<T>` = { readonly [K in keyof T]: T[K] }\n2. Implement Partial`<T>` from scratch\n3. Build a DeepPartial`<T>` type that makes all nested properties optional using recursion\n4. Use keyof and typeof in combination to type a safe object property accessor\n",
      },
      {
        id: 'ts-day-02-t-5',
        sequenceOrder: 5,
        title: 'Type-Safe State Manager',
        isStretchGoal: false,
        estimatedMinutes: 55,
        instructionsMarkdown:
          "**TypeScript · Day 2: Generics, Utility Types & Advanced Type Patterns** · Task 5 of 8 · about 55 min\n\n## Today's goal\nBy the end of the day you will have built a generic typed API client, type-safe state manager, and all Week 4 data structures fully typed.\n\n## What to do\n\n1. Convert Week 4 state manager: createStore`<S, A extends { type: string }>`(initialState: S, reducer: (state: S, action: A) => S)\n2. dispatch must only accept valid action types: dispatch(action: A)\n3. subscribe: (listener: (state: S) => void): () => void\n4. Write a typed reducer for the Kanban board with discriminated union actions: ADD_CARD, REMOVE_CARD, MOVE_CARD\n",
      },
      {
        id: 'ts-day-02-t-6',
        sequenceOrder: 6,
        title: 'Generic API Client',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 2: Generics, Utility Types & Advanced Type Patterns** · Task 6 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built a generic typed API client, type-safe state manager, and all Week 4 data structures fully typed.\n\n## What to do\n\n1. Build ApiClient(baseUrl: string) with get`<T>`(path): Promise`<T>`, post`<T, B>`(path, body: B): Promise`<T>`, put`<T, B>`, delete`<T>`\n2. All methods use fetchJSON and propagate generic types correctly\n3. Add request/response interceptors with typed callbacks\n4. Write a typed MockApiClient implementing the same interface for testing\n",
      },
      {
        id: 'ts-day-02-t-7',
        sequenceOrder: 7,
        title: 'Conditional & Infer Types',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 2: Generics, Utility Types & Advanced Type Patterns** · Task 7 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built a generic typed API client, type-safe state manager, and all Week 4 data structures fully typed.\n\n## What to do\n\n1. Write IsArray`<T>` = T extends any[] ? true : false\n2. Write Flatten`<T>` = T extends Array`<infer Item>` ? Item : T\n3. Write Awaited`<T>` = T extends Promise`<infer U>` ? Awaited`<U>` : T - recursive Promise unwrapping\n4. Implement Parameters`<T>` and ReturnType`<T>` from scratch using infer\n5. Find TypeScript's built-in lib.es5.d.ts in node_modules and read five utility type definitions\n",
      },
      {
        id: 'ts-day-02-t-8',
        sequenceOrder: 8,
        title: 'Convert the Router to TypeScript',
        isStretchGoal: false,
        estimatedMinutes: 45,
        instructionsMarkdown:
          "**TypeScript · Day 2: Generics, Utility Types & Advanced Type Patterns** · Task 8 of 8 · about 45 min\n\n## Today's goal\nBy the end of the day you will have built a generic typed API client, type-safe state manager, and all Week 4 data structures fully typed.\n\n## What to do\n\n1. Type route config: Route = { path: string; component: (params: Record`<string, string>`) => HTMLElement }\n2. Type navigate: navigate(path: string, params?: Record`<string, string>`): void\n3. Zero errors. Zero any in the router module.\n",
      },
      {
        id: 'ts-day-02-t-9',
        sequenceOrder: 9,
        title:
          'Build a type-safe query builder: QueryBuilder<T extends Record<string, unknown>> with…',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          "**TypeScript · Day 2: Generics, Utility Types & Advanced Type Patterns** · Daily challenge (stretch goal)\n\n> Attempt this only when every main task for today is finished. Never skip a main task for it.\n\n## Challenge\nBuild a type-safe query builder: QueryBuilder<T extends Record`<string, unknown>`> with where`<K extends keyof T>`(field: K, operator: '=' | '>' | '<' | 'LIKE', value: T[K]) - TypeScript enforces that value type matches field type. Zero any.\n",
      },
    ],
  },
  {
    dayId: 'ts-day-03',
    dayNumber: 3,
    courseTitle: 'TypeScript',
    tasks: [
      {
        id: 'ts-day-03-t-1',
        sequenceOrder: 1,
        title: 'Access Modifiers & Parameter Properties',
        isStretchGoal: false,
        estimatedMinutes: 40,
        instructionsMarkdown:
          "**TypeScript · Day 3: TypeScript Classes, Interfaces & Access Modifiers** · Task 1 of 8 · about 40 min\n\n## Today's goal\nBy the end of the day you will have built all Week 3 classes (CartModule, FormValidator, EventEmitter) fully converted with access modifiers implementing typed interfaces.\n\n## What to do\n\n1. Convert BankAccount to TypeScript: balance is private, accountNumber is readonly, owner is public\n2. Use parameter properties: constructor(private balance: number, public readonly owner: string) - no separate property declarations\n3. Add protected transfer(amount: number) that SavingsAccount can call but external code cannot\n4. Add a #hashPrivate field - show the difference between TypeScript private and JS #private in compiled output\n",
      },
      {
        id: 'ts-day-03-t-2',
        sequenceOrder: 2,
        title: 'Interfaces & implements',
        isStretchGoal: false,
        estimatedMinutes: 45,
        instructionsMarkdown:
          "**TypeScript · Day 3: TypeScript Classes, Interfaces & Access Modifiers** · Task 2 of 8 · about 45 min\n\n## Today's goal\nBy the end of the day you will have built all Week 3 classes (CartModule, FormValidator, EventEmitter) fully converted with access modifiers implementing typed interfaces.\n\n## What to do\n\n1. Define Serializable with toJSON(): string and fromJSON(data: string): this\n2. Define Printable with print(): void and getDisplayName(): string\n3. Define Validatable with validate(): ValidationResult\n4. Implement all three on a Document class - TypeScript confirms the class satisfies all three\n5. Show structural typing: a plain object that satisfies Serializable without explicitly implementing it\n",
      },
      {
        id: 'ts-day-03-t-3',
        sequenceOrder: 3,
        title: 'Abstract Classes',
        isStretchGoal: false,
        estimatedMinutes: 45,
        instructionsMarkdown:
          "**TypeScript · Day 3: TypeScript Classes, Interfaces & Access Modifiers** · Task 3 of 8 · about 45 min\n\n## Today's goal\nBy the end of the day you will have built all Week 3 classes (CartModule, FormValidator, EventEmitter) fully converted with access modifiers implementing typed interfaces.\n\n## What to do\n\n1. Define abstract Shape with abstract area(): number and abstract perimeter(): number, plus a concrete describe() method\n2. Show that abstract classes cannot be instantiated - TypeScript catches this at compile time\n3. Implement with Circle, Rectangle, Triangle\n4. Add a static factory: Shape.create(type: 'circle' | 'rect' | 'triangle', ...args) returning the correct subclass\n",
      },
      {
        id: 'ts-day-03-t-4',
        sequenceOrder: 4,
        title: 'Declaration Merging & Module Augmentation',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 3: TypeScript Classes, Interfaces & Access Modifiers** · Task 4 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built all Week 3 classes (CartModule, FormValidator, EventEmitter) fully converted with access modifiers implementing typed interfaces.\n\n## What to do\n\n1. Demonstrate interface merging: declare User interface twice - TypeScript merges them\n2. Augment Array: add a sum() method to Array`<number>` via interface merging\n3. Augment the Window interface: add window.appState with the correct type\n4. Augment an npm module: create a .d.ts file adding a missing method to a fictional library\n",
      },
      {
        id: 'ts-day-03-t-5',
        sequenceOrder: 5,
        title: 'Convert TypedEventEmitter',
        isStretchGoal: false,
        estimatedMinutes: 55,
        instructionsMarkdown:
          "**TypeScript · Day 3: TypeScript Classes, Interfaces & Access Modifiers** · Task 5 of 8 · about 55 min\n\n## Today's goal\nBy the end of the day you will have built all Week 3 classes (CartModule, FormValidator, EventEmitter) fully converted with access modifiers implementing typed interfaces.\n\n## What to do\n\n1. Build TypedEventEmitter<Events extends Record`<string, any[]>`> with on`<K extends keyof Events>`(event: K, listener: (...args: Events[K]) => void): this\n2. emit must only accept defined events with correct argument types\n3. Define UserEvents = { userAdded: [User]; userRemoved: [string]; userUpdated: [string, Partial`<User>`] }\n4. Show TypeScript catches wrong argument types at compile time. Zero any.\n",
      },
      {
        id: 'ts-day-03-t-6',
        sequenceOrder: 6,
        title: 'Convert FormValidator to TypeScript',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 3: TypeScript Classes, Interfaces & Access Modifiers** · Task 6 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built all Week 3 classes (CartModule, FormValidator, EventEmitter) fully converted with access modifiers implementing typed interfaces.\n\n## What to do\n\n1. Define Rule`<T = unknown>` = { required?: boolean; minLength?: number; pattern?: RegExp; custom?: (v: T) => string | null }\n2. Build FormValidator<T extends Record`<string, unknown>`>(form, rules: { [K in keyof T]?: Rule`<T[K]>`[] })\n3. validate returns { valid: boolean; errors: Partial<Record`<keyof T, string>`> }\n4. All state private. All public methods have explicit return types. Zero any.\n",
      },
      {
        id: 'ts-day-03-t-7',
        sequenceOrder: 7,
        title: 'Design Pattern Interfaces',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 3: TypeScript Classes, Interfaces & Access Modifiers** · Task 7 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built all Week 3 classes (CartModule, FormValidator, EventEmitter) fully converted with access modifiers implementing typed interfaces.\n\n## What to do\n\n1. Define Observable`<T>` interface with subscribe(observer: Observer`<T>`): Unsubscribe\n2. Implement Observable`<T>` in a Subject`<T>` class\n3. Define Command with execute(): void and undo(): void\n4. Implement CommandHistory that stores Commands and supports undo/redo\n5. Write a typed test verifying CommandHistory correctly reverses five commands\n",
      },
      {
        id: 'ts-day-03-t-8',
        sequenceOrder: 8,
        title: 'TypeScript Decorators',
        isStretchGoal: false,
        estimatedMinutes: 45,
        instructionsMarkdown:
          "**TypeScript · Day 3: TypeScript Classes, Interfaces & Access Modifiers** · Task 8 of 8 · about 45 min\n\n## Today's goal\nBy the end of the day you will have built all Week 3 classes (CartModule, FormValidator, EventEmitter) fully converted with access modifiers implementing typed interfaces.\n\n## What to do\n\n1. Enable experimentalDecorators in tsconfig\n2. Write @sealed class decorator that calls Object.seal() on the prototype and constructor\n3. Write @log method decorator that logs method name, arguments, and return value\n4. Apply both to the User class and verify behaviour in Node\n",
      },
      {
        id: 'ts-day-03-t-9',
        sequenceOrder: 9,
        title:
          'Build a type-safe DI container where register<T>(token: InjectionToken<T>, factory: () =>…',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**TypeScript · Day 3: TypeScript Classes, Interfaces & Access Modifiers** · Daily challenge (stretch goal)\n\n> Attempt this only when every main task for today is finished. Never skip a main task for it.\n\n## Challenge\nBuild a type-safe DI container where register`<T>`(token: InjectionToken`<T>`, factory: () => T) and resolve`<T>`(token: InjectionToken`<T>`): T are type-safe at compile time - the resolved type must match the registered type. Use symbols as InjectionToken`<T>` with a phantom type parameter.\n',
      },
    ],
  },
  {
    dayId: 'ts-day-04',
    dayNumber: 4,
    courseTitle: 'TypeScript',
    tasks: [
      {
        id: 'ts-day-04-t-1',
        sequenceOrder: 1,
        title: 'Incremental Migration Strategy',
        isStretchGoal: false,
        estimatedMinutes: 45,
        instructionsMarkdown:
          "**TypeScript · Day 4: Migrating JS to TypeScript & ts-jest** · Task 1 of 8 · about 45 min\n\n## Today's goal\nBy the end of the day you will have built the Week 4 mini SPA fully migrated to TypeScript, ts-jest running the test suite, zero errors, zero any.\n\n## What to do\n\n1. Open the Week 4 SPA. Create tsconfig.json with allowJs: true, checkJs: true, strict: false initially.\n2. Run tsc --noEmit - fix every error in JS files first\n3. Convert one file at a time from .js to .ts - start with utilities, then components, router, state manager\n4. After each conversion run tsc --noEmit - fix errors before moving to the next file\n5. At the end: enable strict: true and fix the additional errors\n",
      },
      {
        id: 'ts-day-04-t-2',
        sequenceOrder: 2,
        title: 'Common Migration Errors & Fixes',
        isStretchGoal: false,
        estimatedMinutes: 40,
        instructionsMarkdown:
          "**TypeScript · Day 4: Migrating JS to TypeScript & ts-jest** · Task 2 of 8 · about 40 min\n\n## Today's goal\nBy the end of the day you will have built the Week 4 mini SPA fully migrated to TypeScript, ts-jest running the test suite, zero errors, zero any.\n\n## What to do\n\n1. 'Property does not exist on type': add to the interface or use a type assertion only as last resort\n2. 'Object is possibly null': add null check, use ?. or ! only when certain - add a comment explaining why\n3. 'Argument of type X is not assignable to Y': understand why types differ, fix the root cause\n4. Document every error pattern and fix in MIGRATION_LOG.md\n",
      },
      {
        id: 'ts-day-04-t-3',
        sequenceOrder: 3,
        title: 'Third-Party Types',
        isStretchGoal: false,
        estimatedMinutes: 40,
        instructionsMarkdown:
          "**TypeScript · Day 4: Migrating JS to TypeScript & ts-jest** · Task 3 of 8 · about 40 min\n\n## Today's goal\nBy the end of the day you will have built the Week 4 mini SPA fully migrated to TypeScript, ts-jest running the test suite, zero errors, zero any.\n\n## What to do\n\n1. Install @types packages for all untyped libraries the SPA uses\n2. For any library with no @types, write a minimal declaration file in src/types/\n3. Show autocomplete and error checking gained after @types/node installation\n4. Run tsc --noEmit after each installation and fix new errors\n",
      },
      {
        id: 'ts-day-04-t-4',
        sequenceOrder: 4,
        title: 'Strict Null Checks - Full Pass',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 4: Migrating JS to TypeScript & ts-jest** · Task 4 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built the Week 4 mini SPA fully migrated to TypeScript, ts-jest running the test suite, zero errors, zero any.\n\n## What to do\n\n1. With strict: true run tsc --noEmit and address every error methodically\n2. For each 'Object is possibly undefined': choose optional chaining (?.), nullish coalescing (??), guard clause, or assertion (!) with justification\n3. For 'Type X | null not assignable to X': add null handling or narrow the type\n4. Goal: tsc --noEmit with strict: true produces zero errors\n",
      },
      {
        id: 'ts-day-04-t-5',
        sequenceOrder: 5,
        title: 'ts-jest Setup & First Typed Tests',
        isStretchGoal: false,
        estimatedMinutes: 55,
        instructionsMarkdown:
          "**TypeScript · Day 4: Migrating JS to TypeScript & ts-jest** · Task 5 of 8 · about 55 min\n\n## Today's goal\nBy the end of the day you will have built the Week 4 mini SPA fully migrated to TypeScript, ts-jest running the test suite, zero errors, zero any.\n\n## What to do\n\n1. Install ts-jest and @types/jest. Add to jest.config.js: preset: 'ts-jest', testEnvironment: 'node'.\n2. Rename test files to .test.ts. Add type annotations to test helpers.\n3. Run npx jest - fix any compilation errors. All tests must pass.\n",
      },
      {
        id: 'ts-day-04-t-6',
        sequenceOrder: 6,
        title: 'Write New TypeScript Tests',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 4: Migrating JS to TypeScript & ts-jest** · Task 6 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built the Week 4 mini SPA fully migrated to TypeScript, ts-jest running the test suite, zero errors, zero any.\n\n## What to do\n\n1. Typed tests for generic Queue`<T>`: verify it correctly stores and retrieves string, number, and object types\n2. Typed test for ApiClient with mocked fetch: mock returns correctly typed response, verify returned data type\n3. Typed tests for state manager: dispatch typed actions, assert state has correct shape\n4. Show TypeScript catches type mismatches in tests - passing wrong types to a helper is a compile error\n",
      },
      {
        id: 'ts-day-04-t-7',
        sequenceOrder: 7,
        title: 'Coverage on TypeScript Project',
        isStretchGoal: false,
        estimatedMinutes: 50,
        instructionsMarkdown:
          "**TypeScript · Day 4: Migrating JS to TypeScript & ts-jest** · Task 7 of 8 · about 50 min\n\n## Today's goal\nBy the end of the day you will have built the Week 4 mini SPA fully migrated to TypeScript, ts-jest running the test suite, zero errors, zero any.\n\n## What to do\n\n1. Run npx jest --coverage. Verify ts-jest maps coverage to original TypeScript source files.\n2. Identify files below 70%. Add targeted tests for each uncovered branch.\n3. Target: 70%+ on all business logic files\n",
      },
      {
        id: 'ts-day-04-t-8',
        sequenceOrder: 8,
        title: 'Type-Only Imports & Path Aliases',
        isStretchGoal: false,
        estimatedMinutes: 45,
        instructionsMarkdown:
          "**TypeScript · Day 4: Migrating JS to TypeScript & ts-jest** · Task 8 of 8 · about 45 min\n\n## Today's goal\nBy the end of the day you will have built the Week 4 mini SPA fully migrated to TypeScript, ts-jest running the test suite, zero errors, zero any.\n\n## What to do\n\n1. Use import type { User } from './types' in files only using User for type annotations - zero runtime overhead\n2. Add path aliases in tsconfig: { '@utils': ['./src/utils'], '@components': ['./src/components'] }\n3. Update all imports to use aliases\n4. Add declaration: true to tsconfig - explore the generated .d.ts files\n",
      },
      {
        id: 'ts-day-04-t-9',
        sequenceOrder: 9,
        title:
          'Write a TypeScript utility type FormSchema<T> that, given a form interface T, generates…',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**TypeScript · Day 4: Migrating JS to TypeScript & ts-jest** · Daily challenge (stretch goal)\n\n> Attempt this only when every main task for today is finished. Never skip a main task for it.\n\n## Challenge\nWrite a TypeScript utility type FormSchema`<T>` that, given a form interface T, generates: a validation rules type, a validation errors type, and a validated (all required fields non-optional) type. Use it to create a fully type-safe registration form flow - define RegisterForm, derive RegisterFormErrors and ValidatedRegisterForm automatically using mapped types.\n',
      },
    ],
  },
  {
    dayId: 'ts-day-05',
    dayNumber: 5,
    courseTitle: 'TypeScript',
    tasks: [
      {
        id: 'ts-day-05-t-1',
        sequenceOrder: 1,
        title: 'Final Clean-up',
        isStretchGoal: false,
        estimatedMinutes: 30,
        instructionsMarkdown:
          "**TypeScript · Day 5: Phase 1 Capstone - Checkpoint 1 Submission** · Task 1 of 6 · about 30 min\n\n## Today's goal\nBy the end of the day you will have built a clean, typed TypeScript project submitted as a PR for Checkpoint 1 - zero errors, zero any, 70%+ coverage, and a comprehensive README.\n\n## What to do\n\n1. tsc --noEmit - zero errors\n2. ESLint - zero warnings or errors\n3. jest --coverage - all tests pass, 70%+ on all business logic\n4. Remove all commented-out code, debug console.logs, and TODO comments without tickets\n5. Verify zero any: npx tsc --strict --noEmit 2>&1 | grep -i any - must return nothing\n",
      },
      {
        id: 'ts-day-05-t-2',
        sequenceOrder: 2,
        title: 'Documentation & README',
        isStretchGoal: false,
        estimatedMinutes: 80,
        instructionsMarkdown:
          "**TypeScript · Day 5: Phase 1 Capstone - Checkpoint 1 Submission** · Task 2 of 6 · about 80 min\n\n## Today's goal\nBy the end of the day you will have built a clean, typed TypeScript project submitted as a PR for Checkpoint 1 - zero errors, zero any, 70%+ coverage, and a comprehensive README.\n\n## What to do\n\n1. README.md: project name, what it does, live demo link, tech stack, TypeScript features used, folder structure, how to run, how to test, how to type-check\n2. ARCHITECTURE.md with a component/module diagram\n3. For every complex type (generics, conditionals, mapped), add JSDoc explaining what it does and why\n4. TYPESCRIPT_DECISIONS.md documenting five type decisions and alternatives considered\n",
      },
      {
        id: 'ts-day-05-t-3',
        sequenceOrder: 3,
        title: 'Polish & Final Commit',
        isStretchGoal: false,
        estimatedMinutes: 70,
        instructionsMarkdown:
          "**TypeScript · Day 5: Phase 1 Capstone - Checkpoint 1 Submission** · Task 3 of 6 · about 70 min\n\n## Today's goal\nBy the end of the day you will have built a clean, typed TypeScript project submitted as a PR for Checkpoint 1 - zero errors, zero any, 70%+ coverage, and a comprehensive README.\n\n## What to do\n\n1. Reword unclear commit messages using git rebase -i\n2. Add GitHub Actions workflow (.github/workflows/ci.yml): run tsc --noEmit, ESLint, jest --coverage on every PR\n3. Verify the workflow runs successfully on a test push\n4. Tag final commit: git tag v1.0.0 && git push --tags\n5. Final commit: 'release: Phase 1 Checkpoint 1 - TypeScript SPA'\n",
      },
      {
        id: 'ts-day-05-t-4',
        sequenceOrder: 4,
        title: 'Open PR & Self-Review',
        isStretchGoal: false,
        estimatedMinutes: 60,
        instructionsMarkdown:
          "**TypeScript · Day 5: Phase 1 Capstone - Checkpoint 1 Submission** · Task 4 of 6 · about 60 min\n\n## Today's goal\nBy the end of the day you will have built a clean, typed TypeScript project submitted as a PR for Checkpoint 1 - zero errors, zero any, 70%+ coverage, and a comprehensive README.\n\n## What to do\n\n1. Open a PR from feature branch to main. Write a thorough description: what the project is, TypeScript patterns used, what was most challenging, what the reviewer should focus on.\n2. Review your own PR using GitHub's diff view - leave comments on any uncertain lines\n3. Verify CI is green. Ping mentor to begin the Checkpoint 1 review.\n",
      },
      {
        id: 'ts-day-05-t-5',
        sequenceOrder: 5,
        title: 'Checkpoint 1 Review Preparation',
        isStretchGoal: false,
        estimatedMinutes: 70,
        instructionsMarkdown:
          "**TypeScript · Day 5: Phase 1 Capstone - Checkpoint 1 Submission** · Task 5 of 6 · about 70 min\n\n## Today's goal\nBy the end of the day you will have built a clean, typed TypeScript project submitted as a PR for Checkpoint 1 - zero errors, zero any, 70%+ coverage, and a comprehensive README.\n\n## What to do\n\n1. Prepare to answer: 'Walk me through how your generic ApiClient`<T>` type system works'\n2. Prepare to answer: 'Why did you use a discriminated union for API responses?'\n3. Prepare to answer: 'What does strict: true enable and why does it make codebases safer?'\n4. Write a 30-day growth plan for Phase 2: three specific Node.js topics, three React topics, one TypeScript topic\n",
      },
      {
        id: 'ts-day-05-t-6',
        sequenceOrder: 6,
        title: 'Phase 1 Reflection',
        isStretchGoal: false,
        estimatedMinutes: 60,
        instructionsMarkdown:
          "**TypeScript · Day 5: Phase 1 Capstone - Checkpoint 1 Submission** · Task 6 of 6 · about 60 min\n\n## Today's goal\nBy the end of the day you will have built a clean, typed TypeScript project submitted as a PR for Checkpoint 1 - zero errors, zero any, 70%+ coverage, and a comprehensive README.\n\n## What to do\n\n1. Write in your journal: five most important things learned across five weeks\n2. Write: one moment where something clicked that had been confusing\n3. Write: three areas where you feel least confident going into Phase 2\n4. Complete the Phase 1 self-assessment: rate yourself 1–5 on each week's checklist objectives\n5. Share reflection with pod in Slack - read and leave one supportive comment on a partner's\n",
      },
      {
        id: 'ts-day-05-t-7',
        sequenceOrder: 7,
        title: 'Add runtime type validation to your TypeScript project',
        isStretchGoal: true,
        estimatedMinutes: null,
        instructionsMarkdown:
          '**TypeScript · Day 5: Phase 1 Capstone - Checkpoint 1 Submission** · Daily challenge (stretch goal)\n\n> Attempt this only when every main task for today is finished. Never skip a main task for it.\n\n## Challenge\nAdd runtime type validation to your TypeScript project. Write a tiny type-safe schema library: Schema`<T>` with string(), number(), boolean(), object(shape), array(item), optional(), and parse(value: unknown): T | ValidationError. TypeScript types must be inferred: type User = z.infer`<typeof schema>`.\n',
      },
    ],
  },
];
