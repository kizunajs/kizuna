import type { BetterAuthOptions, Session, User } from 'better-auth';
import type { EmailOTPOptions, MagicLinkOptions, OrganizationOptions, OTPOptions, PhoneNumberOptions } from 'better-auth/plugins';

type UserOptions = NonNullable<BetterAuthOptions['user']>;
type DatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>;
type UserHooks = NonNullable<DatabaseHooks['user']>;
type SessionHooks = NonNullable<DatabaseHooks['session']>;

/**
 * Every event, and the Better Auth callback or hook it fills. The payloads
 * come from these types, so this is the only list.
 */
export interface BetterAuthCallbacks {
    sendResetPassword: NonNullable<NonNullable<BetterAuthOptions['emailAndPassword']>['sendResetPassword']>;
    sendVerificationEmail: NonNullable<NonNullable<BetterAuthOptions['emailVerification']>['sendVerificationEmail']>;
    sendChangeEmailConfirmation: NonNullable<NonNullable<UserOptions['changeEmail']>['sendChangeEmailConfirmation']>;
    sendDeleteAccountVerification: NonNullable<NonNullable<UserOptions['deleteUser']>['sendDeleteAccountVerification']>;
    sendInvitationEmail: NonNullable<OrganizationOptions['sendInvitationEmail']>;
    sendMagicLink: MagicLinkOptions['sendMagicLink'];
    sendVerificationOTP: EmailOTPOptions['sendVerificationOTP'];
    sendPhoneNumberOTP: PhoneNumberOptions['sendOTP'];
    sendPasswordResetOTP: NonNullable<PhoneNumberOptions['sendPasswordResetOTP']>;
    sendTwoFactorOTP: NonNullable<OTPOptions['sendOTP']>;
    userCreated: NonNullable<NonNullable<UserHooks['create']>['after']>;
    userUpdated: NonNullable<NonNullable<UserHooks['update']>['after']>;
    userDeleted: NonNullable<NonNullable<UserHooks['delete']>['after']>;
    emailVerified: NonNullable<NonNullable<BetterAuthOptions['emailVerification']>['afterEmailVerification']>;
    passwordReset: NonNullable<NonNullable<BetterAuthOptions['emailAndPassword']>['onPasswordReset']>;
    sessionCreated: NonNullable<NonNullable<SessionHooks['create']>['after']>;
}

/**
 * The name of an event.
 */
export type BetterAuthEvent = keyof BetterAuthCallbacks;

type Callable = (...args: never[]) => unknown;

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

/**
 * A session as `sessionCreated` carries it. Its token stays with Better Auth.
 */
export type BetterAuthSessionInfo = Omit<Jsonify<Session>, 'token'>;

type SentBy<Event extends BetterAuthEvent> = Jsonify<Parameters<BetterAuthCallbacks[Event]>[0]>;

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

/**
 * What each event carries: what Better Auth hands the callback, as JSON. The
 * hooks hand over the record itself, so theirs is wrapped as `user` or
 * `session`.
 */
export type BetterAuthEventPayloads<AppUser = BetterAuthUser> = {
    [Event in BetterAuthEvent]: Event extends 'userCreated' | 'userUpdated' | 'userDeleted' | 'emailVerified'
        ? {
              user: AppUser;
          }
        : Event extends 'sessionCreated'
          ? {
                session: BetterAuthSessionInfo;
            }
          : WithUser<SentBy<Event>, AppUser>;
};

/**
 * What the forwarder posts and the webhook route reads.
 */
export interface BetterAuthEventBody {
    event: BetterAuthEvent;
    data: Record<string, unknown>;
}
