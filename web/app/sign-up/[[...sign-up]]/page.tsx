import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex h-full items-center justify-center bg-white dark:bg-dark-chat">
      <SignUp />
    </div>
  );
}
