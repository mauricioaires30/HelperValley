using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Xna.Framework.Content;

if (args.Length < 2)
{
    Console.Error.WriteLine("Usage: Dumper <game dir> <output dir> [asset prefix...]");
    return 1;
}

string gameDir = args[0];
string outDir = args[1];
string contentDir = Path.Combine(gameDir, "Content");
// Asset folders (relative to Content) whose non-texture assets are dumped.
string[] prefixes = args.Length > 2
    ? args[2..]
    : ["Data", "Strings", "Characters/schedules", "Characters/Dialogue"];

var content = new ContentManager(new EmptyServices(), contentDir);
var json = new JsonSerializerOptions
{
    IncludeFields = true,
    WriteIndented = false,
    ReferenceHandler = ReferenceHandler.IgnoreCycles,
    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals,
};

int ok = 0, skipped = 0;
foreach (string prefix in prefixes)
{
    string dir = Path.Combine(contentDir, prefix);
    if (!Directory.Exists(dir)) continue;
    foreach (string file in Directory.EnumerateFiles(dir, "*.xnb", SearchOption.AllDirectories))
    {
        string asset = Path.GetRelativePath(contentDir, file)[..^4].Replace(Path.DirectorySeparatorChar, '/');
        try
        {
            object value = content.Load<object>(asset);
            string target = Path.Combine(outDir, asset + ".json");
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.WriteAllText(target, JsonSerializer.Serialize(value, value.GetType(), json));
            ok++;
        }
        catch (Exception ex)
        {
            // Textures, maps and effects need a graphics device; those are handled elsewhere.
            skipped++;
            Console.Error.WriteLine($"skip {asset}: {ex.GetType().Name}: {ex.Message.Split('\n')[0]}");
        }
    }
}

Console.WriteLine($"Dumped {ok} assets ({skipped} skipped) to {outDir}");
return 0;

sealed class EmptyServices : IServiceProvider
{
    public object? GetService(Type serviceType) => null;
}
