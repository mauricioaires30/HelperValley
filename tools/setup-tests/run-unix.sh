#!/usr/bin/env bash
# Runs the guide's exact Mac and Linux commands through every scenario, on fake folders only.
# On Windows, in Git Bash: "ln" makes a junction, which Git Bash treats as a link, and the service
# managers are stubs. It tests the commands' logic, not a real Mac or Linux machine.
cmds="$1"
for platform in mac linux; do
  echo "=== $platform ==="
  HOME_FAKE="$(cygpath -u "$USERPROFILE")/Documents/hv-unix-test"
  [ -e "$HOME_FAKE" ] && { echo "test folder exists"; exit 1; }
  mkdir -p "$HOME_FAKE/bin" "$HOME_FAKE/Documents"
  cat > "$HOME_FAKE/bin/ln" <<'EOF'
#!/usr/bin/env bash
cmd //c mklink //J "$(cygpath -w "$3")" "$(cygpath -w "$2")" > /dev/null
EOF
  cat > "$HOME_FAKE/bin/launchctl" <<'EOF'
#!/usr/bin/env bash
echo "launchctl $*" >> "$HOME/services.log"
EOF
  cp "$HOME_FAKE/bin/launchctl" "$HOME_FAKE/bin/systemctl"
  sed -i 's/launchctl \$\*/systemctl $*/' "$HOME_FAKE/bin/systemctl"
  chmod +x "$HOME_FAKE/bin/"*
  run() { (export HOME="$HOME_FAKE" PATH="$HOME_FAKE/bin:$PATH"; bash "$cmds/$1-$platform.txt" 2>&1 | head -1; echo "  codigo=${PIPESTATUS[0]}"); }
  saves="$HOME_FAKE/.config/StardewValley/Saves"; root="$HOME_FAKE/Documents/Stardew Valley"
  show() { kind=nao-existe; [ -d "$saves" ] && kind=pasta; [ -L "$saves" ] && kind=link; echo "[$1] saves=$kind | save: $(cat "$saves/Farm_1/Farm_1" 2>/dev/null) | Saves em docs: $([ -d "$root/Saves" ] && echo sim || echo nao) | backup: $(cat "$root/Backup/Farm_1/Farm_1" 2>/dev/null) | aninhou: $([ -e "$root/Saves/Saves" ] && echo SIM || echo nao)"; }

  mkdir -p "$saves/Farm_1"; echo "dia 1" > "$saves/Farm_1/Farm_1"; echo info > "$saves/Farm_1/SaveGameInfo"
  show inicio
  echo "--- primeira vez"; run setup; show depois
  echo "--- servicos: $(cat "$HOME_FAKE/services.log" 2>/dev/null | tr '\n' ';')"
  if [ "$platform" = mac ]; then file="$HOME_FAKE/Library/LaunchAgents/com.helpervalley.backup.plist"; grep -c "Stardew Valley/Saves/\." "$file" | sed 's/^/  plist com o caminho: /'; else file="$HOME_FAKE/.config/systemd/user/helpervalley-backup.service"; grep "ExecStart" "$file" | sed "s#$HOME_FAKE#~#g; s/^/  /"; fi
  echo "--- rodar de novo"; run setup; show depois
  echo "--- jogo salva e a copia de 1 minuto roda"; echo "dia 2" > "$saves/Farm_1/Farm_1"; cp -Rp "$root/Saves/." "$root/Backup/"; show depois
  echo "--- apagar a pasta Saves"; rm -rf "$root/Saves"; show apagada
  echo "--- rodar de novo recupera"; run setup; show recuperada
  echo "--- voltar ao normal"; run revert; show normal
  echo "--- voltar de novo nao faz nada"; run revert; show depois
  echo "--- duas pastas reais: nao mexe"; mkdir -p "$root/Saves"; echo x > "$root/Saves/outro"; run setup; show depois; rm -rf "$root/Saves"
  if [ "$platform" = linux ]; then echo "--- steam flatpak: nao mexe"; mkdir -p "$HOME_FAKE/.var/app/com.valvesoftware.Steam/.config/StardewValley"; run setup; show depois; fi
  rm -rf "$HOME_FAKE"
  echo "--- limpeza: $([ -e "$HOME_FAKE" ] && echo FALHOU || echo ok)"
done
