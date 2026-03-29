# Deploy to Synology NAS

Run through the deployment checklist for pushing changes to the DS713+ (192.168.1.252).

## Pre-deployment Checks

1. Verify all tests pass (if test suite exists)
2. Check for any hardcoded secrets or debug code (`console.log` with sensitive data, `TODO`, `FIXME`)
3. Verify `.env.example` is updated if new environment variables were added
4. Confirm `db/schema.sql` reflects any database changes
5. Check that no files in `.gitignore` are being tracked

## Deployment Steps

1. Commit all changes with a descriptive message
2. Push to the remote repository
3. SSH into the NAS: `ssh admin@192.168.1.252`
4. Pull latest code: `cd /volume1/web/quartier-bike-id && git pull`
5. Install any new dependencies: `npm install`
6. Apply any database migrations (if schema changed)
7. Restart the application: `pm2 restart quartier-bike-id`
8. Verify the app is running: `pm2 status`
9. Test the public URL via Cloudflare Tunnel

## Post-deployment Verification

- App responds on `http://192.168.1.252:8080` (LAN)
- App responds on the public Cloudflare Tunnel URL (HTTPS)
- Login flow works
- New features function as expected
- Check `pm2 logs quartier-bike-id --lines 20` for startup errors

## Rollback (if needed)

```bash
cd /volume1/web/quartier-bike-id
git log --oneline -5          # Find the previous good commit
git checkout <commit-hash>    # Revert to it
pm2 restart quartier-bike-id
```
