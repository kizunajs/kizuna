import type { BetterAuthOptions, Session, User } from 'better-auth';

type UserOptions = NonNullable<BetterAuthOptions['user']>;
type DatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>;
type UserHooks = NonNullable<DatabaseHooks['user']>;
type SessionHooks = NonNullable<DatabaseHooks['session']>;

/**
 * The core callbacks and hooks `kizuna` fills itself, by the path each sits at
 * in Better Auth's options. Every other event is named by where its
 * `forward()` sits.
 */
export interface CoreCallbacks {
    'emailAndPassword.sendResetPassword': NonNullable<NonNullable<BetterAuthOptions['emailAndPassword']>['sendResetPassword']>;
    'emailAndPassword.onPasswordReset': NonNullable<NonNullable<BetterAuthOptions['emailAndPassword']>['onPasswordReset']>;
    'emailVerification.sendVerificationEmail': NonNullable<NonNullable<BetterAuthOptions['emailVerification']>['sendVerificationEmail']>;
    'emailVerification.afterEmailVerification': NonNullable<NonNullable<BetterAuthOptions['emailVerification']>['afterEmailVerification']>;
    'user.changeEmail.sendChangeEmailConfirmation': NonNullable<NonNullable<UserOptions['changeEmail']>['sendChangeEmailConfirmation']>;
    'user.deleteUser.sendDeleteAccountVerification': NonNullable<NonNullable<UserOptions['deleteUser']>['sendDeleteAccountVerification']>;
    'databaseHooks.user.create.after': NonNullable<NonNullable<UserHooks['create']>['after']>;
    'databaseHooks.user.update.after': NonNullable<NonNullable<UserHooks['update']>['after']>;
    'databaseHooks.user.delete.after': NonNullable<NonNullable<UserHooks['delete']>['after']>;
    'databaseHooks.session.create.after': NonNullable<NonNullable<SessionHooks['create']>['after']>;
}

/**
 * The core events whose payload is the user record itself.
 */
type UserRecordEvent =
    | 'emailVerification.afterEmailVerification'
    | 'databaseHooks.user.create.after'
    | 'databaseHooks.user.update.after'
    | 'databaseHooks.user.delete.after';

type Callable = (...args: never[]) => unknown;

/**
 * A function that reports something and returns nothing, which is what a
 * `forward()` can stand in for.
 */
type Notifier = (...args: never[]) => void | Promise<void>;

/**
 * A value as it arrives after JSON: dates become strings, and functions are
 * left out.
 */
export type Jsonify<Value> = Value extends Date
    ? string
    : Value extends Callable
      ? never
      : Value extends readonly (infer Item)[]
        ? Jsonify<Item>[]
        : Value extends object
          ? {
                [Key in keyof Value as Value[Key] extends Callable ? never : Key]: Jsonify<Value[Key]>;
            }
          : Value;

/**
 * A user as it arrives: Better Auth's own, with dates as ISO strings.
 */
export type BetterAuthUser = Jsonify<User>;

type Depth = [unknown, unknown, unknown, unknown];

/**
 * Every notifying function under an options object, as `[path, function]`.
 */
type NotifierPaths<Options, Prefix extends string = '', Seen extends unknown[] = []> = Seen['length'] extends Depth['length']
    ? never
    : string extends keyof Options
      ? never
      : {
            [Key in keyof Options & string]-?: NonNullable<Options[Key]> extends Callable
                ? NonNullable<Options[Key]> extends Notifier
                    ? [`${Prefix}${Key}`, NonNullable<Options[Key]>]
                    : never
                : NonNullable<Options[Key]> extends readonly unknown[]
                  ? never
                  : NonNullable<Options[Key]> extends object
                    ? NotifierPaths<NonNullable<Options[Key]>, `${Prefix}${Key}.`, [...Seen, unknown]>
                    : never;
        }[keyof Options & string];

type PluginsOf<App> = App extends {
    options: {
        plugins?: infer Plugins;
    };
}
    ? NonNullable<Plugins> extends readonly (infer Plugin)[]
        ? Plugin
        : never
    : never;

/**
 * Every notifying function across the app's plugins, as
 * `[pluginId.path, function]`.
 */
type PluginNotifiers<App> =
    PluginsOf<App> extends infer Plugin
        ? Plugin extends {
              id: infer Id extends string;
              options?: infer Options;
          }
            ? string extends Id
                ? never
                : NotifierPaths<NonNullable<Options>> extends infer Entry
                  ? Entry extends [infer Path extends string, infer Function]
                      ? [`${Id}.${Path}`, Function]
                      : never
                  : never
            : never
        : never;

/**
 * Puts the app's own user where Better Auth hands over a user.
 */
type WithUser<Payload, AppUser> = Payload extends {
    user: unknown;
}
    ? Omit<Payload, 'user'> & {
          user: AppUser;
      }
    : Payload;

type FirstArgument<Function> = Function extends (first: infer First, ...rest: never[]) => unknown ? First : never;

/**
 * What a core event carries: what Better Auth hands the callback, as JSON. A
 * session's token stays with Better Auth.
 */
export type CoreEventPayloads<AppUser = BetterAuthUser> = {
    [Event in keyof CoreCallbacks]: Event extends UserRecordEvent
        ? AppUser
        : Event extends 'databaseHooks.session.create.after'
          ? Omit<Jsonify<Session>, 'token'>
          : WithUser<Jsonify<FirstArgument<CoreCallbacks[Event]>>, AppUser>;
};

/**
 * What each of the app's plugin events carries, named by where its `forward()`
 * sits, read from the Better Auth app's own type.
 */
export type PluginEventPayloads<App, AppUser = BetterAuthUser> = {
    [Entry in PluginNotifiers<App> as Entry[0]]: WithUser<Jsonify<FirstArgument<Entry[1]>>, AppUser>;
};

/**
 * The user as the Better Auth app knows it, its own fields included.
 */
export type AppUserOf<App> = App extends {
    $Infer: {
        Session: {
            user: infer AppUser;
        };
    };
}
    ? Jsonify<AppUser>
    : BetterAuthUser;

/**
 * Every event the app can receive, typed. Without the Better Auth app's type,
 * the core events.
 */
export type BetterAuthEventPayloads<App = undefined, AppUser = AppUserOf<App>> = CoreEventPayloads<AppUser> &
    PluginEventPayloads<App, AppUser>;

/**
 * What `forward()` posts and the webhook route reads.
 */
export interface BetterAuthEventBody {
    event: string;
    data: Record<string, unknown>;
}

/**
 * Carries the Better Auth app's type to the API, where nothing of the app runs.
 */
export interface BetterAuthAppType<App> {
    readonly app?: App;
}
