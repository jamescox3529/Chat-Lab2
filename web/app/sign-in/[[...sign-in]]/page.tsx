import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex h-full items-center justify-center bg-white dark:bg-dark-chat">
      <SignIn />
    </div>
  );
}
