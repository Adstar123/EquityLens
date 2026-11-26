import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `<div class="signing-in" role="status">Signing you in</div>`,
  styles: [`
    .signing-in {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 50vh;
      font-size: 14px;
      color: var(--text-muted);
    }
  `],
})
export class AuthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.auth.login(token);
      this.router.navigate(['/dashboard']);
    } else {
      this.router.navigate(['/']);
    }
  }
}
