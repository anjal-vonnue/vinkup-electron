// Augments Passport's Express.User interface so `trainee` in passport callbacks
// and `req.user` are typed as your actual Trainee shape instead of `{}`.
export {};

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      role: 'trainee' | 'mentor' | 'manager';
    }
  }
}
