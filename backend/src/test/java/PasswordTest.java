import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class PasswordTest {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        
        // 数据库中的哈希
        String dbHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36gZvWFm";
        
        // 测试不同的密码
        String[] passwords = {"admin123", "admin", "123456"};
        
        for (String pwd : passwords) {
            boolean matches = encoder.matches(pwd, dbHash);
            System.out.println("Password: " + pwd + " -> " + (matches ? "✓ MATCH" : "✗ NO MATCH"));
        }
        
        // 生成新的哈希
        System.out.println("\n新生成的 admin123 哈希:");
        System.out.println(encoder.encode("admin123"));
    }
}
