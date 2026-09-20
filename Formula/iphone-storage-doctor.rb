class IphoneStorageDoctor < Formula
  include Language::Python::Virtualenv

  desc "Diagnose iPhone storage and battery health over USB"
  homepage "https://github.com/tlegourrierec/iphone-storage-doctor"
  url "https://github.com/tlegourrierec/iphone-storage-doctor/archive/refs/tags/v1.3.2.tar.gz"
  # Remplacer par : shasum -a 256 de l'archive publiée par GitHub.
  sha256 "45c8f5c957e19d7a2ebeac79c57e01b72450e3f0c2c6b6eb7d0ceee2f4b97712"
  license "MIT"

  depends_on "python@3.13"

  def install
    virtualenv_create(libexec, "python3.13")
    # pymobiledevice3 n'est pas dans homebrew-core et tire un arbre de
    # dépendances profond : on laisse pip le résoudre dans le venv isolé.
    system libexec/"bin/pip", "install", "--no-cache-dir", buildpath
    bin.install_symlink libexec/"bin/ipsd"
    bin.install_symlink libexec/"bin/iphone-storage-doctor"
  end

  def caveats
    <<~EOS
      Plug in the iPhone, unlock it and tap "Trust This Computer", then run:

        ipsd doctor

      Cleaning is a dry run by default. "ipsd clean --apply" executes, after
      copying every file to the Mac first.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ipsd --version")
    # With no device attached the CLI must fail cleanly (exit 2), not traceback.
    output = shell_output("#{bin}/ipsd storage 2>&1", 2)
    refute_match "Traceback", output
  end
end
